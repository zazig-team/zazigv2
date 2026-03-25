# Using the ChatGPT Deep Research API — A Complete Guide

> **Source:** [hackingthemarkets.com/openai-deep-research-api-and-webhooks](https://hackingthemarkets.com/openai-deep-research-api-and-webhooks/) · Video by Part Time Larry
> **Combined format:** video transcript + written tutorial

---

## Overview

OpenAI's Deep Research has quickly emerged as one of the most powerful tools released this year, delivering high-quality, structured analysis across a wide range of topics. In previous testing against the endpoint security market, Deep Research produced analyst-grade output that handily outperformed comparable results from Google Gemini.

But for all its strengths, the original Deep Research tool came with clear limitations:

1. **Interface lock-in** — it could only be used directly from the ChatGPT interface, making integration into custom applications difficult.
2. **No completion notifications** — reports can take 30 minutes to an hour to run, and there was no way to be notified when a job finished short of manually checking.
3. **No access to private data** — Deep Research would only search publicly available web content, with no way to point it at private documents, newsletters, or internal knowledge bases.

OpenAI's new Deep Research API addresses all three of these limitations. It allows you to:

- Call Deep Research **programmatically** from your own code
- Use **webhooks** to receive a callback when a research job finishes
- Add **MCP servers** to expose private data (such as a paid newsletter archive) as a searchable tool for the research agent

This guide walks through the full architecture and implementation of an end-to-end application built around these capabilities.

---

## What the Application Does

The demo application — built for a firm called Part Time Research — brings together the following components:

1. A **UI for managing Deep Research prompts** stored in a SQLite database
2. The ability to **trigger Deep Research agents** on demand or on a schedule (e.g., every Monday at 8 a.m.)
3. A **webhook endpoint** that receives completed reports, processes them, and stores them in a local database
4. A **web dashboard** displaying reports with a custom logo
5. **PDF generation** and **branded email delivery** of reports to clients
6. A **vector store** populated with premium subscription content (e.g., Stratechery articles)
7. An **MCP server** that exposes that vector store to the Deep Research agent for citation

---

## Part 1: The Deep Research API

### Transcript (0:00–1:44)

> "OpenAI's deep research has quickly become one of my favorite AI tools. In a previous video, I looked at its performance when researching the endpoint security market, and I came away very impressed with the structured analysis and output that it produced. Now, even though it was very powerful, I found there were a few limitations when using deep research. Number one is I had to use it directly from the ChatGPT interface. Now, this isn't necessarily a problem for everyone, but I find that I often want to take the output of my queries and process them and integrate them with my own custom applications. Secondly, these reports take a long time to run. So when you kick off an agent, it might take 30 minutes, it might take an hour. How do you know when that report is actually done? Maybe you go take a coffee break and then you come back and you check, is it done yet? Where's my output? The third thing it was limited by is that it would search the web for research. But in my case sometimes I have some private documents or some newsletters or other pieces of information that I want to search and it would be nice to take all this power in this deep research agent and be able to apply it to my own internal private knowledge base — not just publicly accessible information.
>
> The good news is there are a few new features that OpenAI released that help with all of this. First, they've released the deep research model and the deep research API, meaning that you can programmatically call OpenAI's deep research. You can either call the o3 deep research model or the o4 mini deep research model and you can give it access to tools like web search and it will get kicked off and run in the background and perform its deep research and get all that output for you."

### How to Call the API

Triggering a Deep Research task is done via the OpenAI **Responses API** using a Deep Research reasoning model — either `o3-deep-research` or `o4-mini-deep-research`. Your request must also specify one or more tools for the agent to use.

The example below is adapted from the OpenAI Cookbook with a prompt tailored for researching ServiceNow as an investment target:

```python
import os
from openai import OpenAI

client = OpenAI(timeout=3600)

system_message = """
You are a senior research analyst specializing in the IT services sector. Your role is to generate
detailed, structured, and data-driven research reports on companies and trends across areas such as
endpoint security, remote monitoring and management (RMM), helpdesk/ticketing platforms, and broader
cybersecurity infrastructure.

Your reports must:
- Prioritize analyst-grade data: include concrete metrics such as ARR, YoY growth, NRR, customer count,
  pricing tiers, win rates, churn, gross margin, sales efficiency, and competitive positioning.
- Identify market dynamics: highlight adoption trends, regulatory headwinds/tailwinds, buyer personas,
  procurement cycles, and TAM/SAM/SOM breakdowns where relevant.
- Call out opportunities for visual summaries.
- Source only credible, recent material: earnings calls, SEC filings, Gartner, IDC, Forrester, top-tier
  financial media or equity analysts.
- Include inline citations and return full source metadata.
"""

prompt = """
Research ServiceNow (NYSE: NOW) as an investment and strategic competitive intelligence target within
the IT services sector. Produce a detailed, structured report covering:

1. Company Overview
2. Financial Performance (Last 3 Years + Latest Quarter)
3. Go-to-Market and Sales Efficiency
4. Competitive Landscape
5. Strategic Risks and Opportunities
6. Valuation and Market Sentiment
"""

response = client.responses.create(
    model="o4-mini-deep-research-2025-06-26",  # or o3-deep-research for more detail
    input=[
        {
            "role": "developer",
            "content": [{"type": "input_text", "text": system_message}]
        },
        {
            "role": "user",
            "content": [{"type": "input_text", "text": prompt}]
        }
    ],
    background=True,
    tools=[
        {"type": "web_search_preview"}
    ],
)
```

The `background=True` flag means execution continues immediately — the research job runs asynchronously in the background.

### Polling for Completion

The documentation suggests polling until the job is complete:

```python
import time

while response.status in {"queued", "in_progress"}:
    print(f"Current status: {response.status}")
    time.sleep(5)
    response = client.responses.retrieve(response.id)

print(f"Final status: {response.status}\nOutput:\n{response.output_text}")
```

> **Note:** In practice, the polling status can show "queued" even after the response has been generated. For development and debugging, checking the **OpenAI Platform logs** directly is more reliable — they show timestamp, model, tools used, token count, reasoning steps, and final output.

### Cost Considerations

Deep Research and reasoning models are significantly more expensive than standard completions. Runs of `o4-mini-deep-research` typically cost **$1–3 per API call**. However, for use cases like investment research or competitive analysis, the value generated typically far exceeds this cost. Prices continue to fall over time.

---

## Part 2: Webhooks

### Transcript (1:44–2:24)

> "There's now support for webhooks, meaning that when that deep research job finishes, you can have OpenAI call you back and post back to your application. Then you can take the report results and process them — run any custom Python code in your own endpoint. This is a Flask web app endpoint. You can authenticate it to make sure that request came from OpenAI, and then you can process it and perform whatever other tasks you want on it. Since it's a Python program, you might want to store it in the database, extract some structured output from this report, send yourself an email — whatever type of logic you can think of, you can add your own custom processing right here."

### Why Webhooks Matter

Rather than polling, webhooks let OpenAI **push** the completed report to your application. You configure an endpoint in the OpenAI settings dashboard, select the `response.completed` event, and OpenAI will POST the payload to your URL when the job is done. This enables any downstream processing you want: database storage, PDF generation, email delivery, structured data extraction, and so on.

### Setting Up a Webhook in OpenAI

1. Go to the **OpenAI Settings page**
2. Navigate to the **Webhooks** section
3. Click **Create** and enter a public URL for OpenAI to POST to
4. Select the event type: `response.completed`
5. Save — OpenAI will provide a **webhook secret** for authenticating incoming requests

### Database Schema

Before writing the webhook handler, set up a database to store reports:

```python
def create_tables():
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS research (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            response_id TEXT,
            prompt TEXT,
            output TEXT,
            company TEXT,
            topic TEXT,
            pdf_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT NOT NULL,
            text_prompt TEXT NOT NULL,
            model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
```

### Webhook Endpoint with Structured Extraction

The webhook handler authenticates the request using OpenAI's webhook secret, extracts structured metadata from the report using `gpt-4o`, then stores everything in the database:

```python
from pydantic import BaseModel
from typing import List
from openai import InvalidWebhookSignatureError

class ResearchExtraction(BaseModel):
    companies: List[str]
    topics: List[str]
    primary_company: str
    primary_topic: str

@app.route("/webhook", methods=["POST"])
def webhook():
    print("webhook called")
    try:
        # Authenticate: verify the request came from OpenAI
        event = client.webhooks.unwrap(request.data, request.headers)

        if event.type == "response.completed":
            response_id = event.data.id
            response = client.responses.retrieve(response_id)

            conn = get_db()
            company = "Unknown"
            topic = "General"

            try:
                # Use structured extraction to identify the report's subject
                extraction_response = client.responses.parse(
                    model="gpt-4o",
                    input=[
                        {
                            "role": "system",
                            "content": "Extract the primary company and topic from this research report."
                        },
                        {
                            "role": "user",
                            "content": response.output_text
                        }
                    ],
                    text_format=ResearchExtraction,
                )
                extracted_data = extraction_response.output_parsed
                company = extracted_data.primary_company or "Unknown"
                topic = extracted_data.primary_topic or "General"

            except Exception as e:
                print(f"Could not extract structured data: {e}")

            # Generate PDF with custom logo
            pdf_path = generate_pdf_from_markdown(response.output_text, response_id, company, topic)

            # Store in database
            conn.execute(
                "INSERT INTO research (response_id, prompt, output, company, topic, pdf_path) VALUES (?, ?, ?, ?, ?, ?)",
                (response_id, response.prompt, response.output_text, company, topic, pdf_path)
            )
            conn.commit()
            conn.close()

        return Response(status=200)

    except InvalidWebhookSignatureError as e:
        print("Invalid signature", e)
        return Response("Invalid signature", status=400)
```

### Exposing Your Local App with ngrok

During development, your Flask app runs locally and has no public URL. Use **ngrok** to create a secure tunnel:

```bash
ngrok http 5001
```

ngrok gives you a public URL (e.g., `https://abc123.ngrok.io`) that forwards to your local port. Use this URL when registering your webhook in OpenAI's dashboard. Alternatives to ngrok include:

- Cloudflare Tunnels
- A VPS (Linode, Digital Ocean)
- Replit
- AWS Lambda
- Google Cloud Functions

### Testing Your Webhook Cheaply

Before testing with a full Deep Research model (which is slow and costly), use a standard model to verify your plumbing works end-to-end:

```python
# test_webhook.py
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI()

resp = client.responses.create(
    model="gpt-4o",
    input="Why should I care about Cloudflare as an investor? Focus on AI features like Cloudflare Workers AI and Cloudflare Containers.",
    background=True,
    tools=[{"type": "web_search_preview"}]
)

print(resp.status)
```

This lets you confirm that: OpenAI receives your request, your webhook receives the callback, your app processes it without errors, and your dashboard displays the result — all before committing to a full Deep Research run.

---

## Part 3: MCP Servers and Private Data

### Transcript (2:24–3:08)

> "The third piece they added is support for MCP servers, meaning you can add additional tools. For instance, I have some internal documents. Let's say I'm a subscriber to Stratechery here — there's tons of great analysis provided by Ben Thompson — and I want to add this to my deep research. It's a quality publication and I want to add it to my deep research report and have deep research cite this internal documentation. So as an example of this, I may want to programmatically ingest my Stratechery subscription via their private RSS feed and feed it into a vector store in OpenAI. And then I can use OpenAI's example MCP server to expose this vector store for search and retrieval to the OpenAI deep research agent."

### How It Works

MCP (Model Context Protocol) servers let you add **custom tools** to the Deep Research agent beyond what OpenAI provides natively. The key use case here is giving Deep Research access to private documents that aren't publicly available on the web.

The workflow is:

1. **Ingest** your private content (e.g., parse a Stratechery RSS feed and save articles as Markdown files)
2. **Upload** those files into an **OpenAI Vector Store**
3. **Spin up an MCP server** that wraps that vector store and exposes a `file_search` tool
4. **Reference that MCP server** in your Deep Research API call so the agent can search your private content alongside the web

When you look at the OpenAI Platform logs for a run that uses an MCP server, you can see exactly which MCP tools were called (e.g., `internal_file_lookup`), what the agent retrieved, and how it cited the private documents in the final report — even documents like "Meta's Reset: AI as Sustaining Innovation" that aren't publicly accessible on the web.

---

## Part 4: The Full Application

### Transcript (3:08–5:52)

> "In order to show you all this functionality working end to end, I've created my own web application here for my firm, Part-Time Research, where you can see all of this functionality coming together in a full stack web application. I've also prepared a writeup complete with code examples on my website at hackingthemarkets.com.
>
> The first thing it provides is a UI for managing deep research prompts. And so what I have here is an admin area and manage prompts. You see there's a simple web interface — there's a few companies I'm interested in exploring. I'm interested in Cloudflare and new AI features like Cloudflare Workers, Cloudflare Containers, and how this AI inference opportunity will play out for Cloudflare. I want OpenAI to go out there and find me all the latest information and put it together in a nice report.
>
> Secondly, I'm interested in Meta's AI strategy — they're hiring a bunch of people, spending hundreds of millions of dollars on talent, and building agents to automate their advertising business. And then third, I'm interested in ServiceNow and IT management and ticketing. So I've created all these prompts. You can edit any one of them — a few fields for a topic, a prompt, and a model. And you can add a new one. All this is stored in a SQLite database.
>
> There's also a run button. So let's say I want to test one of these prompts. I can click run and that'll kick off one of these deep research tasks. Now, once I kicked off that API request — you see there's eventually a POST back to a webhook endpoint. That's OpenAI calling me back with my research. Then I can run my own code and process it. I extracted some information from that report and it says email sent successfully."

### Key Features of the Application

**Prompt Management UI** — A simple admin interface backed by SQLite where you can create, edit, and run Deep Research prompts. Each prompt stores a topic, the full prompt text, and the model to use.

**On-Demand and Scheduled Runs** — Any prompt can be triggered manually via a "Run" button, or scheduled on a recurring basis (e.g., "every Monday at 8 a.m., show me everything that happened with Cloudflare over the past week").

**Research Dashboard** — Once a webhook delivers a completed report, it appears in a web dashboard where you can read it in the browser or download it as a PDF.

**Branded PDF and Email Output** — Reports are automatically converted to PDF with a custom logo and emailed to clients. This creates a workflow where the agent handles research end-to-end with no manual intervention.

**Recent Research Feed** — A chronological view of all incoming reports so you can see what just became available.

---

## Part 5: Utility Scripts

### Transcript (6:50–7:53)

> "I'll also demonstrate a few utility scripts for our MCP server. The first is called parse_strategy, which goes through and grabs all the Stratechery articles and saves them in a directory in Markdown format. I'll also create a vector store — I'll actually create an OpenAI vector store, go through the articles directory and load them all up into the OpenAI vector store. We'll then spin up an MCP server that serves up this vector store and adds it as a tool so that OpenAI's deep research can actually use it.
>
> We'll also create a few testing scripts: make sure we can successfully search the vector store and that it can successfully return relevant documents. We'll create a webhook tester to kick off a quick task and make sure our webhook is correctly working. We'll also test that deep research can successfully use our MCP server — I have this test internal file lookup tool to make sure it can actually access the Stratechery articles and cite them."

### Summary of Utility Scripts

| Script | Purpose |
|---|---|
| `parse_strategy.py` | Parses private RSS feed, saves articles as Markdown |
| `create_vector_store.py` | Creates an OpenAI vector store and uploads all articles |
| `run_mcp_server.py` | Starts the MCP server that exposes the vector store as a tool |
| `test_vector_search.py` | Verifies the vector store returns relevant documents |
| `test_webhook.py` | Sends a cheap API call to test the full webhook pipeline |
| `test_mcp_lookup.py` | Confirms Deep Research can access and cite private documents |

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Application                        │
│                                                             │
│  ┌──────────────┐    ┌───────────────┐    ┌─────────────┐  │
│  │ Prompt Mgmt  │───▶│ Deep Research │───▶│  Webhook    │  │
│  │     UI       │    │   API Call    │    │  Endpoint   │  │
│  │  (SQLite)    │    │ (background)  │    │  (Flask)    │  │
│  └──────────────┘    └───────────────┘    └──────┬──────┘  │
│                              │                   │         │
│                     ┌────────┴──────┐    ┌───────▼──────┐  │
│                     │  MCP Server   │    │  Processing  │  │
│                     │ (Vector Store │    │  - DB Store  │  │
│                     │  private docs)│    │  - PDF Gen   │  │
│                     └───────────────┘    │  - Email     │  │
│                                          └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## What's Next

### Transcript (8:36–9:03)

> "In the next video, I'll get started with actually coding the application — starting with the very basics and going through component by component. Starting with the deep research API and just making a basic API call, kicking it off in the background. And then I'll go over webhooks and how to actually get a callback whenever this deep research finishes and processing that webhook, setting up your own local server, things like that."

The next steps in the series will cover:

1. Making a basic Deep Research API call and running it in the background
2. Setting up a local Flask server and processing incoming webhooks
3. Building the prompt management UI and SQLite backend
4. Implementing PDF generation and branded email delivery
5. Ingesting private subscription content into a vector store
6. Standing up the MCP server and connecting it to Deep Research

---

## Key Takeaways

The Deep Research API transforms what was previously a read-only ChatGPT feature into a fully programmable research automation platform. The combination of the Responses API (with `background=True`), webhooks for completion callbacks, and MCP servers for private data access means you can build workflows that continuously monitor topics, process results automatically, and deliver branded output to clients — all without manual intervention.

For investment research, competitive intelligence, or any domain where timely, comprehensive analysis matters, this API stack unlocks a genuinely powerful automation layer on top of one of OpenAI's best models.

---

*Source: [hackingthemarkets.com](https://hackingthemarkets.com/openai-deep-research-api-and-webhooks/) — Part Time Larry*
