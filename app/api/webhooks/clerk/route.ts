import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const event = await verifyWebhook(request);

    if (event.type !== "user.created") {
      return new Response("Event ignored", { status: 200 });
    }

    const clerkUser = event.data;
    const primaryEmail = clerkUser.email_addresses.find(
      (email) => email.id === clerkUser.primary_email_address_id,
    );

    if (!primaryEmail) {
      console.error("CLERK WEBHOOK: missing primary email", {
        primaryEmailAddressId: clerkUser.primary_email_address_id,
        emailAddresses: clerkUser.email_addresses,
        clerkUserId: clerkUser.id,
      });
      return new Response("User has no primary email address", { status: 400 });
    }

    const users = await db.orm.public.User.all();
    const normalizedEmail = primaryEmail.email_address.trim().toLowerCase();
    const existingUser = users.find((user) => user.clerkId === clerkUser.id);

    if (existingUser) {
      if (String(existingUser.role) === "BANNED") {
        const client = await (await import("@clerk/nextjs/server")).clerkClient();
        await client.users.deleteUser(clerkUser.id).catch(() => undefined);
        return new Response("Blocked account", { status: 200 });
      }
      return new Response("User already exists", { status: 200 });
    }

    const bannedEmail = users.find(
      (user) => String(user.email).trim().toLowerCase() === normalizedEmail && String(user.role) === "BANNED",
    );
    if (bannedEmail) {
      const client = await (await import("@clerk/nextjs/server")).clerkClient();
      await client.users.deleteUser(clerkUser.id).catch((error) => {
        console.error("CLERK WEBHOOK: failed to delete blocked account", error);
      });
      return new Response("Blocked email", { status: 200 });
    }

    const conflictingEmail = users.find(
      (user) => String(user.email).trim().toLowerCase() === normalizedEmail && user.clerkId !== clerkUser.id,
    );
    if (conflictingEmail) {
      console.error("CLERK WEBHOOK: email identity conflict", { clerkUserId: clerkUser.id, existingUserId: conflictingEmail.id });
      return new Response("Email already associated with another identity", { status: 409 });
    }

    await db.orm.public.User.create({
      clerkId: clerkUser.id,
      email: primaryEmail.email_address,
      name: [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") || null,
    });

    return new Response("User created", { status: 201 });
  } catch (error) {
    console.error("CLERK WEBHOOK ERROR:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
