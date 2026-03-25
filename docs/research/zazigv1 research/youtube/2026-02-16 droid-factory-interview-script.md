# What Makes Droid Different From Other AI Agents — Full Script

All right, welcome everyone. My guest today is co-founder of Factory, a popular AI coding agent called Droid that works with any terminal or IDE. Today he'll show us how great engineers actually work with AI agents. He gave us a live demo and we'll also talk about the crazy competitive AI coding space and what actually has product-market fit in that space. So welcome, sir.

Hey, thanks so much for having me. I'm really excited to be here and there's nothing more I love chatting about than software development agents.

All right, cool. Yeah, so maybe before getting into the demo, can you tell us about Factory and Droid and kind of what makes it different from other AI coding tools?

Yeah, totally. And you know, Factory — we've been around for actually a surprising length. We're about two and a half years old. And when we first started, the world was not really comfortable with the concept of letting an agent just, you know, call it YOLO mode or whatever, on your computer. And so we said we really need to orient around building products that will work in enterprise environments and build products that made, you know, VPs of engineering of a 10,000-person organization feel comfortable.

And so we set out on a long journey to build these AI systems. We call it Droid — the sort of core agent. Our product doesn't stop at the terminal or the IDE or the web or desktop. Of course we have those surfaces. But we also provide tooling that helps you analyze your entire company's codebases to determine what's stopping agents from being successful. We give you ROI analytics. We give you enterprise controls. So there's sort of a lot of layers that make us feel maybe like the full enterprise solution to software development agents.

Got it. Yeah. It's smart that you guys focused on enterprise from day one because I question the product-market fit on the consumer side. So, smart.

Yeah. Totally. I think there's a lot of optionality that people have — like there's a million different coding agents and some of them are hackable, some of them are not. I think the people who care about quality have found their way to us. But if you're cost-optimizing or something else, you may just go with a subsidized plan or an open tool.

---

## Live Demo: Building a Speed Reading App From Meeting Notes

Awesome. Let's build something live. What do you think we should build?

No, I love this idea. And I was thinking that maybe we would start sharing my screen. And I was thinking maybe we could, like Granola, actually record some of our back and forth on maybe a prototype of some form, a web app. What do you think? Is there a specific direction you wanted to take this?

Yeah, we can just build a simple web app and maybe you can use some, you know, best practices of using Droid. You can show us how things work.

Yeah. Yeah, totally. Then maybe what I'd suggest is — and I'm going to pop this open, hide this, share my screen, and show this Granola transcript that I have right here. What we can do is we can build out an app that showcases like a simple fast reading application. You know, I don't know if you've seen this viral thing on Twitter where you have like a book and you upload a bunch of documents and then it lets you read really quickly, like speed-read basically. Sound interesting?

Yeah, that sounds good.

Cool. So, typically what I recommend to folks is when you want to use Droid, you open up either the terminal or our IDE extension. Here I'm just going to use the terminal and I'm using Ghostty. I love how quick it is. And basically, we have a fairly simple interface that lets you type in. If you've ever used a terminal-based agent, you'll have all the bells and whistles. We support things like skills, MCP, hooks, etc. You can select your model. And I think one of the cooler parts about Factory is that we support nearly every frontier model as well as different levels of what we call autonomy — which is basically how much do you want to give the agent the ability to operate in its environment. Do you want to approve every action it takes? Do you want only read-only commands, reversible, or everything?

I'm going to turn it on high autonomy here and I'm just going to paste this transcript. This is like the transcript from Granola that we just had where I suggested we do this. This is something we do all the time. Let's build a prototype for this in this directory, please. And I'm just going to paste it.

A couple things that I think are interesting about Droid. You're going to see it plan, read, list directories — make this really simple for you to sort of see what it's actually doing at a high level as it works. But I think when you actually go under the hood, where Droid shines the most is on things like basically long-running tasks, when you want it to run for not just a minute or 10 minutes, but really like an hour. It's too hard to show in a quick podcast. But we've done a lot around things like compaction or compression and prompt caching to make the experience feel really nice.

And dude, I just want to mention one thing — the fact that I can just, I think I use tab or something to pick like "allow all commands" versus "allow some commands" — that has much better UI than, you know, like I love Claude Code but the default experience in Claude Code where it asks you for permission for everything — it sucks, man. I don't like sitting around trying to grant it permissions, you know.

Totally. I think that there's actually like a real security and risk thing of — if you give people two options like "I have to approve everything manually" or "dangerously run YOLO mode." Here you can see Droid is actually opening the browser for me autonomously. And it's jumped in and it's basically testing out — you can see it's taking screenshots and QA-ing the work that it just did. So it's going to determine, did I adequately test what the user is doing?

Is that using Playwright or is it just some native thing that you built?

This is using Chrome DevTools. But by the time that this podcast airs, we've actually made this native. So the Droid for everybody will be able to browse, interact — and you can see it's basically confirmed that it's done. And it gave me a little alert and I can iterate.

So I think most people who've used a tool like this are familiar with this workflow, but I think that once you actually jump in, a lot of the nice quality-of-life things — like the ability to create skills, manage your skills in one place, an MCP registry that contains most of the major tools that you'll use like Linear, Notion, etc., like one click away — really just make for a much nicer experience when you're developing. So if you want a strong multi-model harness, I think Droid is basically the leading option there.

---

## The Difference Between Spec Mode and Plan Mode

It's typical best practice to write like a little plan or spec first before you do this thing. But in this case, I guess our spec is just a Granola conversation.

Exactly. And but what I recommend is — we actually have something called spec mode. And maybe the nuance here is basically — and you can do this by just hitting Shift+Tab — the nuance here is that when you're in spec mode, I'm gonna say, "Let's make this a more fully fleshed out product." What you're going to see is that in spec mode — a lot of agents call this planning mode — our view is that a plan is a little different from a spec. Like a spec is what should be built, and a plan is how you build it. We think the agent should figure out the how. You shouldn't be in plan mode. You should be in spec mode where you define — basically here it's asking me questions about like what input sources should be able to use. I'm going to say all of the above. What reading enhancement features would you like? Maybe chunk mode. And local storage, you know, any additional features. I could type my own answer here and say, "Let's definitely have a party mode button."

So I've answered all of its questions. And it's going to propose a specification. And when it proposes the spec to me, I have a bunch of different options — like I can choose to edit it. I can open this up. You'll see that this is saved as an actual document. And so if I choose to manually edit, it'll actually open VS Code for me so that I can jump in here and look through this spec, read through it, edit it. And after I've edited — I'm just going to delete party mode. Let's go ahead.

You'll see that Droid will pull that spec in, reread the changes I've made, and kick off a plan to go further.

Got it. Got it. And this is after it's already built the initial version, right?

Yeah, exactly. So we basically just specced out a whole new plan of how to work.

Got it. Yeah, this is awesome. So as it's iterating, you're going to see it's changing stuff. So obviously it's not going to work — React's hot reload is obviously awesome because it's going to keep hot reloading. But the moment that it completes its work, you can see it's asking for permission as it operates. I'm actually going to shift it to high autonomy so it stops asking me permission. And I'm going to just let it cook.

Oh, so you can actually shift it while it's actually working?

Yeah, I can shift in and out of spec mode. I can shift the autonomy levels. I can actually change the model mid-session. So if I want to start and plan in, for example, Opus but then execute with GPT 5.2 — these are all settings that you can turn on, or if you just want to switch mid-session, you can.

Got it. I do think being able to pick the model is important. I guess I kind of get comp access to a lot of this stuff, so I don't think about cost. But if you're running an enterprise, the cost really matters, right? Because Opus is pretty expensive. You don't want to run it for everything.

Yeah. Yep. Totally. And I think that there's also a lot of things that people are discovering now, which is — for example, GPT 5.2 Codex is extremely diligent. It's very good at validating its own work. And it will run for a long period of time, but it doesn't have the same sort of high-level planning intelligence that, fairly subjectively — although we have some evals to back this up — Opus 4.5 has. And so there's a great way to sort of get the best of both worlds in model-agnostic harnesses, because you can actually say, "Look, Opus will plan and GPT 5.2 will execute." And that combo actually outperforms either alone.

So a lot of what we try to do is actually make decisions like these way easier for you by setting sensible defaults, giving you a really solid experience. And of course the cost thing matters a lot for people. So being able to switch to a cheaper model or a more expensive model tends to be a pretty pleasant experience.

---

## How Real Engineers Use AI Agents vs. Vibe Coders

So do you have any high-level tips — like how would a real engineer use this versus, you know, a vibe coder?

Totally. I think that probably one of the things that's most optimized for real engineering scenarios is Droid has a lot of both system-level injections and prompting, as well as harness-level modifications, to really heavily encourage validation of its work. We use this word "validation" a lot, but our view is that agents are fundamentally bottlenecked by the ability to validate their own work. Chrome DevTools is a great example of sort of QA-ing and validating that the change it made actually visually makes sense.

Code has tons of these validators. You have linters, unit tests, type checkers. I don't know if you can see that it's continuously building, running dev, linting, type-checking in this flow right here as Droid is working. We think that we've basically done this probably to a higher degree than most, which is a big benefit for the actual product experience that people have.

So here it's going to open this up. You can see it taking control. We've added some of the things that we mentioned — the ability to add content, full screen, etc.

Yeah. So I don't have to remember to do all this testing manually. You just do it for me each time I ask you to build something new.

Exactly. Like the Droid will actually take screenshots of your product. It will QA it for you. It'll click through. It'll list console messages — like, are there any errors that popped up in the console? This is a lot of stuff that we think, you know, as somebody who is in product or somebody who is in data science, or even just someone who's not a front-end or full-stack engineer — if you're building prototypes or you're building straight-up end-to-end real work as a production engineer — obviously you can know these things and everyone knows it's good to do them. But when your agent is the one that sort of says, "No, I actually need to validate my work to move to the next step," the quality of the output is way higher.

So I think a lot of people, sort of when they say like Droid subjectively feels really good, what they're actually pointing towards is this idea that we validate the work very rigorously. And it doesn't really come at that much of a cost of spend or tokens because it's sort of the "measure twice, cut once" thing. A lot of agents are measuring once, cutting once, measuring again, cutting again. And for us, it's like — just validate the work iteratively and you'll get a much higher result.

Got it, dude. Let's check out the app, man. So what does this thing actually do?

Yeah. So this is a speed reading app that basically lets you go through and — I think the idea is that it helps you maintain comprehension as it works. I've noticed that it's doing two-word chunks. So what I actually want to do is I want to see if I can change it to one-word chunks. And so the idea is you can sort of read this as it goes.

Got it. Got it. So it reads much faster than having a huge paragraph.

Yeah. Exactly. So it's just sort of like a play app that you'd have. But I think that the thing that's sort of fun about this when you full-screen is — I don't know if you can tell, but this is actually already stylized. We have a public website where we've got a lot of content. One thing that I like is that Droid is really good at picking up your codebase's existing styling. So this is our brand colors. These are our sort of similar components to our actual design system. The modules have our borders, the font is ours.

And I think that what a lot of people underestimate is that building stuff that's in your design system — doing it well — is actually fairly difficult. And so if you want to have vibe-coded things that just zero-to-one a random codebase, that's fine. Droid is fairly good at that. But when you have an existing codebase like our Factory public web here and you want to make modifications to it, you want to build a new app, you want to keep consistency of your design system, Droid can do that quite well.

And I didn't have to like — you didn't build a skill or something, like a design system skill. It just does it by reading the code?

No. Yeah. Like if you look back, there's no skill being invoked. It totally could, though. If you wanted to have a skill for your design system, you could. But I think that's actually what's cool about Droid — at the beginning it does this grounding step where it's actually reading through, looking at different layouts, looking at our CSS, looking at different pages, and it's using that to sort of ground its UI.

---

## Skills vs. MCPs vs. Hooks: When to Use Each One

All right, dude. Well, let me ask you this. I'm going to throw you a curveball. So there are all kinds of crazy terms, right? There's skills, there's hooks, there's sub-agents. This is just — for someone who's new, this is super confusing, man. Like when do you actually use all the other stuff? Or can you just go back and forth with AI and just build something?

Yeah. I think that this is such a hotly contested debate. We have full support of all of them, right? So sub-agents, skills, MCP, hooks, slash commands, and a global config that lets you manage all this stuff.

What we've seen is that clearly skills and MCP have by far the highest usage. And I think that this answer changes based on who you are. If you're a solo developer, I think there's a lot of opportunity for you to build your own custom workflow with these things. My personal opinion is that we get a lot of mileage by just having a couple of skills that matter for things like data engineering, for things like building repeatable components and integrations. And I have a skill — and a lot of the people on our team have a skill — for like writing and language that matches their voice when they want to use it to generate content.

In terms of MCP, there are a ton of them. And obviously we have a registry for things like Linear, Notion, Axiom, Datadog, Sentry, etc. My view is that skills might be just a better way to manage integrations and context. So if you can get a skill for a given capability, that might be better than MCP.

And hooks I think are really good if you are the type of person that loves to make their tool super custom. But from enterprises, what we've seen is that enterprises will have a couple of people focus on making skills, MCPs, and tools for their whole organization or for big teams in their org. And because Factory is the only offering that lets you actually, from an enterprise perspective, manage who has what customizations from the user, team, and enterprise level — I think a lot of power users end up getting converted over to Factory because it's just easy to get everyone in your 10,000-person company outfitted with a skill that meaningfully changes their dev productivity on a daily basis.

Okay. So there's like a permission system or something?

Yeah. Permissions and also just shared access to a ton of different skills, tools, and MCP at the enterprise level.

---

## Eno's PM Skill That Completely Blew My Mind

Can you — and you can tell me no on this — but can you actually show us a skill? Like, can you show me your writing skill or whatever skill you want to show?

Yeah, totally. I have a couple here that are live on my prod — like changelog, code canvas, product management, writing, Factory blog posts. So like if I were to go — actually, let's look at the product management one because there's a bunch of PMs watching.

Yeah, of course. Can you open my product management skill file in VS Code? I could probably do that myself, but I use Droid for everything. So it's much easier to just say to Droid like, "Open that file, please." And so there we go.

This is — I actually think this is probably one of my favorite skills that I have. And what this does is, it's basically when I'm doing things like reviewing PRDs, product specs, working on design docs, discussing feature prioritization. I'll zoom in so it's easier to read.

And what I've done is we have a bunch of source-of-truth documents. So we have our product principles. We have a core value prop — what we call the "11-star experience," which is taken from Airbnb. This is an awesome framework for thinking about — basically, Brian Chesky was like, you know, a five-star Airbnb experience: they roll out the red carpet, it's great, you get the Airbnb, they give you the keys, they give you a bunch of cool things to do. Yeah, that's the five-star experience. What's six-star? What's eight? What's eleven? Right. And eleven is like Elon Musk personally takes you on the rocket ship yacht and you go to Mars.

And so what this framework does is it lets you say, "Where are we today?" and "What is the baseline expectation of an amazing experience in your product?" That is the bar. Now what comes after that? What comes when you break that bar? And what's cool about Factory's is, in the last two and a half years, we have slowly moved — like our original 11-star experience, or at least the seven-star that we had two years ago, is now our five-star experience. So it's just the baseline expectation. What wasn't even possible — like, "maybe at some point in the future this will work" — is now what we expect the average user to have in our product. So it's a really cool framework.

Yeah. So, you know, anyway — tons of docs, product positioning, how we build, prioritization frameworks, templates. And what you do is you basically pull all these Notion docs together. Factory has a native Notion integration, so you don't need the MCP. You just integrate it for your whole company and it handles permissions. So it'll pull all that data and then it'll use that for things like PRD reviews, guiding the language, and has a couple of examples.

But bro, which one — I guess it calls different — because this is probably a lot of Notion docs, right? So does it call different Notion docs based on what you want to do, like build a PRD or...?

Yeah, exactly. So basically what this is — you can think of it as like a map almost of our most important documents. And these are shared sources of truth. And I would — if our company was purely people in GitHub, I would probably put these in Markdown in GitHub. But we have folks that use Notion — like our AEs, our ops, most of our product team — and they're actually all product engineers. So they're all engineers. But we pull all this stuff together and then what happens is, based on what you're working on — so if I say like, "I would like to write a PRD about this new thing" — that PRD has the right language. It has our ideas, our principles. And the structure of it ends up looking a lot more like the types of things that if you've been in the room at Factory for a year, you would say — instead of just what Opus 4.5 is randomly opining on.

This is amazing, dude. Maybe you can share this with me privately or something. I can copy this thing so I can make...

Oh yeah, for sure. I'd be happy to. We can maybe attach it to the video and share it with anyone who's listening.

Yeah, that would be amazing. I've always wanted to build a product management skill.

---

## Why Factory Hires Product Engineers vs. PMs

And you mentioned one thing that's a little bit innocuous, but I think has a big impact. You mentioned that you only hire product engineers. So, are you going to hire like a regular PM at some point? Or do you want people with both engineering and PM?

Yeah. Well, I think it's funny because I think what "regular PM" means has totally changed. So my view here is that — and it's compounded by the fact that what we build is a software development agent — so even our AEs are like... we have an AE who's the number three Droid user at the company. So he's in sales, right? But he is still the number three user of Droid. He does everything from Droid. He does customer research. He puts together skills for analyzing customer usage data to determine how he can help provide better experiences for his customers. He uses it to track his deal flow. He has Salesforce connectors. So everything in his life is operated by Droid.

Our view is that I think a lot of people underestimate this aspect of software development agents. And I think it's because of maybe the terminal-dominant UI. But our view at Factory is that software development agents are basically the next generation of general AI systems. And so it's no secret — software development agents are advancing basically everybody's capabilities, not just software engineers. Ask anyone at Cursor, Anthropic, or OpenAI — they'll all admit that most people at the company are using their software development agent for productivity gains.

And so it's quite clear that for us, what it means to be really any role has changed a lot. If you have no experience as a software engineer, you can still be in product at Factory. That's totally fine. But I think you definitely need to drive most of your workflows with AI if you want to work in any role at Factory.

Dude, and your AE probably doesn't know how to read code syntax and stuff like that, right?

He's a bit of an outlier, so he definitely does. However, most of our AEs are definitely not — they're not in VS Code. They're not trying to live and operate their life via the terminal, but they still use Droid because I think it's just a higher level of abstraction. It's almost like engineering — you need to understand some of the technical stuff, but you're basically trying to talk and plan this stuff out in English. It's not like you've got to know about for-loops and while-loops and all that anymore, you know?

Yeah, 100%. I think it's funny because we were just talking about this internally. I think people think of the terminal as sort of this destination or place because they're used to thinking of the IDE as this destination. And what I mean by that is the IDE contains this encompassing view of all the information that's helpful when you're coding, but that also builds walls around the IDE as a concept. It may be easier for a software developer to operate inside those walls, but it really sucks you in. And you open the IDE full screen, it's got all these crazy screens, debuggers, 50 buttons. And this complexity is definitely intentional because it's a power tool, but it changes how you interact with it.

And our view is that the terminal or a native app for agents is not necessarily a destination in and of itself. It's not your full screen. It's more of an overlay. It's this thing that lives on top of the rest of your computer. And sometimes, you know, something that you keep open all the time, something that has access to the file system, the apps, the desktop. I think that this is a better indicator of where the future is going. These software development agents are just general computer-use agents. And so most people who work on computers could benefit from having a little overlay in the upper left-hand corner of their computer that they can talk to and basically ask to do nearly any task for them and it should just work.

Yeah. I mean, all white-collar work is done on computers and code is how computers work, so it kind of makes sense.

Yeah. Like, software is sort of the physics of AI agents. And so it definitely behooves them to be good at manipulating their own physics, their own world. And I think that's also why software development agents have moved way faster than other fields — because they're also made of software. So the self-improving bootstrapping is very clear. We're about to publish some interesting work about how Droid basically has passed the threshold of what we call "self-improving."

Wow.

---

## How a 40-Person Team Competes With Cursor and Anthropic

So let's talk about something — you're a pretty small team, right? How many people are in the company?

We're 40.

Okay. And you're competing against, like, Claude Code and Cursor and these super well-funded companies. And dude, I'm super impressed that you guys are like number one on Terminal Bench with a much smaller team. So how do you do it, man? Any secrets?

No, totally. I mean, I think that there is a funny thing — all the resources in the world, as we all know, cannot necessarily purchase a product experience that's fully crafted for your ICP.

I think there's two angles here that are important. The Cursor team, the Anthropic team, the OpenAI team — I mean, incredible. These are — we know, we work with them all the time. They're all awesome. Every time I've met all these folks, they're total class. So one thing is you have to hold two things in your head: there is a huge, well-funded, very smart group of people also building in this space. But at the same time, I think there's just so much to be explored in AI for software development that effectively just opening Twitter, reading a couple people's workflows, you'll quickly realize the variance in what a good AI software development agent or a good workflow is — it's so high that there's just so much to build.

And so for us, there's two things that really matter. The first is just a relentless focus on customer and ICP. So there are features in Droid that make no sense for a solo developer. Things like the enterprise hierarchical controls, some of how OTEL works — you can actually run Droid in the most air-gapped environment. You could run it in a submarine if you wanted to, as long as you had a GPU.

I think that level of control, flexibility, and customization doesn't really sell well to an individual developer. However, I think this is what has made us more capable in general — because we've built all these things, we have gotten access to customers that have incredibly difficult and very sophisticated software problems to solve. So we get to basically hill-climb not only on public benchmarks — and in fact we actually don't really hill-climb on public benchmarks. Our performance on Terminal Bench is not because of Terminal Bench. It's because of a separate dataset built of more realistic enterprise customer data. And so that I think has been a huge boon for us — being able to work on much harder software problems. And if you solve those, a lot of the — they're not necessarily simpler, but maybe more straightforward problems like full-stack development, zero-to-one, etc. — sort of come naturally.

Yeah. Like the harder software problems are like refactoring and these gnarly legacy codebases, right? It's all the stuff that engineers don't want to do. Is that what...?

Exactly. I think that there is just so much crap involved in software, and no one wants to be the guy or the girl refactoring a COBOL legacy codebase that's 15 years old. Everyone who's touched it is either gone or not working on it anymore. And Droids just do that stuff pretty well.

Yeah, dude. Because I think the best part about Droid and some of these other AI agents is it's very detail-oriented in just reading and understanding the codebase. Because if you onboard a new human developer, it's going to take them a long time to figure out what the hell's going on with the codebase — especially if it's a mess, you know.

Yeah. And I think that that's one of the coolest things we've seen. So we deployed — there's a customer that we deployed, we went zero to 10,000 people in a couple months basically. And one of the ways that we did this was just by enabling not just software engineers but really everybody who wanted access, and saying to them, "Look, if you are someone who is anywhere near the software process, open this tool up and just start asking it some questions that you've been wondering about the world that you operate in."

There are so many people who — because it's very costly time-wise to learn coding or learn big aspects of software — but their work is so consequential to the delivery of software: ops, product, QA, DevOps, data science. They sort of know how some of the software engineering stuff works, or maybe they know pretty well. They just haven't invested time in learning. Droids just make this so much easier. So it does really feel like democratizing access to what used to be a very complex and hard-to-understand topic. You can now just get it digested for pretty cheap.

Yeah, I think enterprises should just give everyone access to the codebase. Like, maybe not write access, but at least read access to just figure out what the hell's going on. Because then you can ask a bunch of questions to Droid and these other agents instead of bothering other people.

Yeah. I mean, a bunch of companies are going to pay a huge cost to design decisions like "we're not a monorepo" or "we're limiting codebase access to only these personas." This stuff is going to not scale well. It won't age well into the AI era. So it's a lot to think about if you're an engineering leader.

And probably a lot of what you're doing is just educating, because if you're trying to sell Droid to Anthropic or something, that makes sense — they understand what's going on. But a lot of these enterprises — like, you know, a century-old company, whatever — they don't know any of this. You have to train them how the stuff actually works.

Yeah. And that's a big part of — also, when you're building a product for enterprise, I think you have to be thinking about not just "does the product work and is the user journey very clear," but also "how does a user become a power user?" What is the activation, and then what is basically the secondary activation — that happens post "I'm using the tool" and now "I'm really using the tool."

And for us, we've seen there's a usage-based activation of like, "I'm sending messages pretty frequently, so I clearly like the product." And then there's a customization activation, which is, "I've uncovered what skills and hooks and MCP and tools..." Those power users in the enterprise very quickly become evangelists. They're sharing it with everybody. They're so excited to use Droid. They start bringing more and more of their work into Droid. And I think that's the most fun — seeing enterprises that most would say are "legacy" doing cooler stuff than what you see on Twitter. Which is fun.

Yeah. It's kind of like the people using Claude Code to run their life, but except for enterprise, right?

Yeah. Exactly. And the enterprise, at the very least, is actually better suited for this sort of stuff. Like, it's still a huge pain to connect your Gmail to Claude Code or to Droid. But you can actually pretty easily connect Outlook, Excel, and all this other stuff to Droid. So yeah, it's a lot easier to operate your work OS from Droid.

Awesome, dude. So people are excited about Droid and building a product management skill and stuff — so where can people go? Droid is free to use, right?

Yeah, just go to factory.ai. We've got the CLI link right there. But if you sign up, we can give you up to a bunch of free usage to get started. Some really exciting things depending on when this airs of free usage that I think a lot of people are going to be excited about. And then we have a bunch of plans for all sorts of options. So really easy to get started. Just one line and you're in.

All right, dude. Well, I have thoughts about a bunch of AI coding companies out there, but I think you guys — it all comes down to focus, man. And I'm super impressed by the progress that you've made. So yeah, I definitely highly encourage everyone to give Droid a try. And also you have some really great talks out there. So should people find you on Twitter, or where can people find you?

Yeah, you can just — it's Eno Reyes. And you can see all my Twitter escapades.

We've got to speed-read — you've got a speed-read thing with the Twitter API so you can just read all the...

You can read all the rage-bait tweets. Exactly. That's a great call — just a daily dose of very fast rage.

Yeah. And then you just become a very demented person. But anyway, yeah. Cool, man. All right, dude. Stay in touch, man.

Yeah. Yeah. Thanks so much. Bye.
