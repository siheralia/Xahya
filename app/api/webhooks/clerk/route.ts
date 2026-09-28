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
      return new Response("User has no email address", { status: 400 });
    }

    const users = await db.orm.public.User.all();
    const existingUser = users.find((user) => user.clerkId === clerkUser.id);

    if (existingUser) {
      return new Response("User already exists", { status: 200 });
    }

    await db.orm.public.User.create({
      clerkId: clerkUser.id,
      email: primaryEmail.email_address,
      name: [clerkUser.first_name, clerkUser.last_name].filter(Boolean).join(" ") || null,
    });

    return new Response("User created", { status: 201 });
  } catch (error) {
    console.error("Clerk webhook error:", error);
    return new Response("Webhook processing failed", { status: 500 });
  }
}
