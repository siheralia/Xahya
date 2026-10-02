# Xahya — Post-Change Verification Checklist

Use this checklist **after completing a functional code change**, especially changes involving APIs, ORM/database access, dates/times, economy, jobs, management, or generated UI.

## 1. Syntax and string integrity

- [ ] Search the changed files for literal \n sequences where an actual newline was intended.
- [ ] Check template literals for broken backticks (`) and interpolation markers (${...}).
- [ ] Check multiline strings, JSX text, JSON, and generated content for accidental escaping or formatting changes.

## 2. Types and data contracts

- [ ] Check `Date` vs `Temporal.Instant`, `Temporal.PlainDate`, `Temporal.PlainDateTime`, etc. against the actual field type.
- [ ] Before `create`/`update`, compare values with the type expected by the ORM/schema instead of assuming JavaScript `Date`.
- [ ] Check nullable/optional fields and enum values against the real schema.
- [ ] If the change touches the database, verify the Prisma/ORM schema, contract, and migration requirements.

## 3. Build and static checks

- [ ] Run the relevant TypeScript/lint checks.
- [ ] Run `build` after significant or cross-cutting changes.
- [ ] Fix errors introduced by the change rather than treating the first successful partial check as completion.

## 4. Runtime and functional verification

- [ ] Exercise the specific flow that was changed.
- [ ] Check server/API runtime errors, not only TypeScript/build output.
- [ ] Check both the normal path and important edge cases affected by the change.
- [ ] For permission-sensitive features, verify unauthorized roles cannot call protected APIs, not merely that UI controls are hidden.

## 5. Final pass

- [ ] Review the final diff for accidental changes, escaped characters, debug code, temporary workarounds, and unrelated edits.
- [ ] If the change affects database structure, confirm the required migration/contract step was completed or explicitly identify it as pending.
- [ ] Only consider the change finished after this checklist has been passed or any unchecked item has a documented reason.

> **Purpose:** catch the small post-edit failures that repeatedly appear after otherwise-correct Xahya changes — especially newline escaping, template-literal interpolation, Temporal type mismatches, ORM type mismatches, and runtime issues.
