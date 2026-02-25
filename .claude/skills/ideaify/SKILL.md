---
name: ideaify
description: Process raw unstructured input into clean, categorised idea records for the Ideas Inbox. Use when receiving messy text, voice transcriptions, or multi-idea dumps.
---

# Ideaify

Converts raw, unstructured input into clean, categorised idea records for the Ideas Inbox.

## Authoritative Logic

All processing logic lives in `projects/skills/ideaify.md`. Read and follow that file exactly.

## Invocation

**Input:** Pass the raw text as-is — voice transcript, brain dump, messy notes, or multi-idea paste. No pre-cleaning needed.

**Output:** One or more structured idea records, each with: title, category, summary, and any relevant tags or context extracted from the input.

## When to Use

- Tom drops unstructured text or a transcript and says "ideaify this"
- CPO receives a "From Tom" card with raw idea content
- A voice note or meeting snippet needs to become actionable Ideas Inbox entries
- Multiple ideas are bundled in one message and need separating
