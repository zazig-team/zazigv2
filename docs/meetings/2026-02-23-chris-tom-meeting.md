## Meeting Overview

- Purpose: Review Zazig V2 design (orchestrator, job lifecycle, merge/test flow), surface current blockers (merge/testing), and agree next focus areas for getting V2 to production-ready.

- Participants: Tom Weaver & Chris Evans

- Date & Duration: 2026-02-23 — 1h 40m (approx)

- Hashtags: #Orchestration #MergeAndTestFlow #V2Launch
    

---

## Key Discussion Points

- Current blocker: merging many PRs then discovering post-merge regressions; need better merge/test/refactor flow and audit trail.

- Proposed job lifecycle: feature → breakdown → jobs → job combiner (merge job branches) → automated verifier → deployer → human test → prod.

- Emphasis on TDD: create tests at feature creation, make tests the driver of work.

- Local-agent (CLI) model: Zazig CLI + local agents run code locally (security advantage; flexible tech stacks).

- Roles, doctrines, skills, canons, and prompt stack: orchestration assembles context from these to produce reliable agent behavior.

- Persistence & observability: persistent roles (CPO), session logs, assembled prompt stack for debugging.

- Reliability features: heartbeat/scheduler/events/wake service, restart/recovery, governance/charter rules.

- Integrations & CLIs: many CLIs are out-of-date in agent attempts — prefer documented website APIs and reliable CLI usage; integrations should be scored.

- Short-term staffing vs automation: use humans for testing gaps until automation is robust; consider juniors/testers for scaling.

- Product/UX notes: Slack may not be ideal UI; consider more suitable channels, dashboards, or a custom gateway for multi-channel security and formatting.

- Company vs project scoping: doctrines/canons/skills need scoping at company level and project level; avoid polluting context windows.

- Execs outside the pipeline: execs (CPO, CTO) should create jobs but never execute them directly; keep them outside the job/feature pipeline.

- Gamification/engagement: leaderboards, real-time strategy feel, civilization-style advisor UX for strategic decisions.
    

---

## Decisions Made

- Prioritize getting Zazig V2 to production; freeze adding new features and focus on reliability and deployment.

- Freeze V1 development entirely — no more work on V1.

- Adopt TDD methodology for features (tests created first, feature acceptance driven by tests).

- Implement a job combiner role to merge job branches into a single feature branch for human testing.

- Capture and store the assembled prompt stack / session logs for every job for debugging and iteration. Rename "assembled context" field to "prompt_stack" in Supabase.

- Keep coding execution local (via CLI/agents); central orchestration + DB/prompts in the backend.

- Execs (CPO, CTO) can create jobs but must never execute jobs directly — keep execs outside the pipeline.

- Frame agent behavioural rules as doctrines/beliefs rather than rules (research shows agents adhere to beliefs more reliably than rules).

- Focus immediate next work on: Tom — feature breakdown flow (CPO creating features → breaking into jobs) and prompt stack assembly; Chris — get V2 to production.
    

---

## Action Items

| Task | Owner | Due / Timeline |
|---|---|---|
| Get V2 to production — no new features, just reliability and deployment | Chris | Next few days |
| Implement job combiner flow to merge job branches into a feature branch | Chris | |
| Ensure feature creation includes test definitions (TDD) and wire verifier to run tests automatically | Chris | |
| Add persistent session logging: store assembled prompt stack per job and role logs | Chris | |
| Rename "assembled context" field to "prompt_stack" in Supabase jobs table | Chris | |
| Harden merge/test workflow and add audit trail (e.g., auto-update Trello/card on agent actions) | Chris | |
| Build restart/recovery and heartbeat/wake services for agents; add scheduler/events queue | Chris | |
| Add `.gitignore` rule for CPO file to prevent worktree merge conflicts | Chris | |
| Focus on feature breakdown flow: CPO creating features → breaking into jobs, with iteration stages | Tom | |
| Design and build the prompt stack assembly (personality + role + skills + doctrines + canons) | Tom | |
| Add research/iteration stage to feature flow (deep research → multi-model review → adversarial red-teaming → breakdown) | Tom | |
| Frame behavioural rules as doctrines/beliefs (e.g., "I believe agents should not require human intervention unless absolutely necessary") | Tom | |
| Create new Cardify-replacement skill for V2 that breaks design docs into jobs | Tom | After V2 is running |
| Evaluate and score integrations (e.g., Supabase, Doppler) and recommend best defaults | Future | |
| Create a short-term staffing plan for manual testing tasks (junior testers / human workers) | tbd | |
| Decide Slack vs. alternative UI channel approach and prototype dashboard/gateway integration | Tom | |
| Add company vs project scoping to doctrines, canons, and skills | Tom | |
| Consider raising funding to accelerate compute/tokens | Tom & Chris | |
| Explore gamification: leaderboards, civilization-style advisor UX, real-time strategy feel | Future | |

---

## Key Sections

### Overview & Current Blockers — 

- Merge/test pain: multiple PRs merged without sequential testing causing regressions and lost work.
    

### High-level Product Vision & Excitement — 

- Team enthusiasm; opportunity to ship quickly and capture market.
    

### CLI / Local Agent & Onboarding Flow — 

- Zazig CLI: login, setup company/project, connect repo, run local agents; plan for brew install distribution.
    

### Data Model: Companies, Projects, Features, Jobs — 

- Supabase tables: companies, users, projects, repositories, features (top-level), jobs (worker-level).
    

### Job Lifecycle & Orchestration Flow — 

- States: queued → assigned → executing → blocked → reviewing → complete/failed; job combiner and verifier detailed.
    

### Methodology: TDD, Research, Iteration & Roles — 

- Use TDD; optional research stage and multi-model review (Claude, Codex, adversarial red-teaming).
    

### Roles, Skills, Doctrines, Canons, Prompt Stack — 

- Orchestrator assembles prompts from role prompts, company doctrines, skills, and canons; consider memory chunks and project vs company scope.
    

### Persistence, Slack Integration & UX Considerations — 

- Persistent CPO role sessions, Slack app exists; consider thread formatting, latency, and alternative UIs/gateway for multi-channel security.
    

### Reliability & Orchestration Services (Heartbeat, Scheduler, Events) — 

- Heartbeat, scheduler, wake service, events queue, and governance/charter modules to manage autonomous behavior and safety.
    

### Product/Engagement Ideas & Roadmap Notes — 

- Strategic features: competitor monitoring, market signal ingestion (Twitter), gamified dashboards/leaderboards, skills-as-apps, and product launch considerations.
    

---

## Additional Context

- Supabase supports vector storage/embedding via extensions — useful for canons/RAG.

- CLI command brittleness is a recurring source of errors; instruct agents to prefer canonical website docs when CLIs are uncertain. Chris estimates 95% of CLI commands agents try are wrong/out-of-date.

- Short-term pragmatic approach: combine automation with human-in-the-loop workers for quick iterations while compute and integration robustness improve.

- Local coding execution means customers can choose any tech stack and install dependencies themselves — Zazig stays flexible and secure.

- Skills are essentially apps — they can be complex, trigger other skills, and will eventually be trainable/purchasable by companies.
    

___

## Transcript

*Tom:* Hello.
*Speaker 1:* Yeah.
*Chris:* Yeah, yeah, I've already turned soccer with Barra in the yard this morning.
*Tom:* You say what?
*Chris:* Been playing soccer with Barra in the in the garden. I look like a witness protection person in this sunlight.
*Chris:* I feel like I I'm definitely the blocker at the moment of my system.
*Tom:* Yeah, which is good.
*Speaker 1:* Yeah.
*Chris:* But the main bit is around merging and then testing the merge, like the code after the merge.
*Speaker 1:* Yeah.
*Chris:* And then refactoring it because nearly after every test, after every merge, there's something wrong.
*Speaker 1:* Yeah.
*Chris:* Yeah, yeah. I'm getting that back through, like putting it back. the VP to do all that takes it's long and yeah that's where I'm getting blocked up at the moment. Like last night as an example I ended up I think I merged eight pull requests from all different things.
*Chris:* I didn't test any of them because I was like if I test one the next one will probably break some of it anyway possibly. play. So I'll just do it all but then the I then started testing. It's like, oh, I found bugs. So I'll put it back through. And so, man, I just got stuck in it.
*Chris:* So now I've got all done again, but I haven't tested it. So don't actually, I'm hoping that it's close, but you just don't know. And I'm like, okay, the new one I'm doing, I'm hoping it removes all this. So I'll talk you through how that works.
*Tom:* In general, I'm finding that the more time I spend... planning and iterating between Claude and Codex in the plan stage, the less I face those issues after.
*Chris:* OK, nice. Well, my problem, I'm worried that I'm losing code in all the mergers.
*Tom:* Yeah, no.
*Chris:* And my VPs are so unreliable at times. that our connection now if it's like
*Speaker 3:* do
*Chris:* doing it all, if that makes sense, because what happens for me most of the time, the VP starts a worker. The worker never tells the VP often that it's finished. So I just noticed that the worker is not there anymore. I then tell the CEO to tell the VP what's going on.
*Chris:* The VP at E thing goes, oh, let me check. This looks interesting, because it looks Looks like it's all done.
*Speaker 3:* I'll do a poor request.
*Speaker 1:* And it's like, yeah.
*Tom:* The needs to be a consistent like reporting at the edits. To update the Trello card or the original place. Trying to do both. So agree. Step in there. Otherwise stuff just gets. And then what? I'm gonna have to show. is that I've got branches and pull requests on different branches that are
*Tom:* conflicted. I mean it's basically this this is the spaghetti-ness when you've got multiple of these things working all at once and then suddenly you've got all the different branches spinning off and conflicting with each other and
*Tom:* then you're just trying to won't pick it all and let alone know whether it works. Yeah, exactly.
*Chris:* So, but I'm... seeing my speed is huge. It's all there. It's close, yeah. It's just that whole bit. It's like not, yeah.
*Tom:* I think this should work. I'm going to add an escalation of EP to do now, which would be effectively as if you were running, if you were saying like give me the prompt and then fucking going around the problem to itself and has to be like I think uh something that we can just go like,
*Tom:* yes, stick it on the card just for the audit trail, but like go to it and make sure it's all tied up.
*Chris:* Yeah, well, I'm trying to do this whole thing now. So when I'm having it create a testing deployment plan or a like steps that it does, and there's a role that just sets up the test server. And then as part of that, it also creates a Slack, a
*Chris:* a worker whose job it is is to fix small bugs when you're testing. Overslike. So you can look at the testing, do it with them and be like, no, this is wrong, can you fix that? And it doesn't have to go the whole way back through the cycle.
*Speaker 3:* Yeah.
*Chris:* So I think that bit is, well, yeah, tighten it up a lot, because I think sending it back there doesn't make sense unless it's like a big issue.
*Speaker 1:* Yeah.
*Speaker 4:* Interesting.
*Chris:* And that's all. after its merge and after its revaced.
*Speaker 1:* Yeah.
*Tom:* The whole new, this whole new get work tree stuff that Claude are doing, does that help us at all?
*Chris:* Are you in? Yes, yeah.
*Tom:* And today just because I had a whole brunch issue.
*Chris:* Mine's only doing work trees, by the way.
*Tom:* You're doing work trees, okay?
*Chris:* Yeah, I've been doing work trees for a while now.
*Tom:* This week, you didn't see? Yeah, so it makes it that it auto-m...
*Chris:* does work trees on any task. Which, yeah, my issue at the moment is, even though we've got work trees, because it keeps updating that CPO style, every single one updates that file, and so they always then have conflicts anyway.
*Tom:* Anyway, exactly.
*Chris:* Yeah, so that's why I'm like, I've got to get be two out that's equal to what we have now because it'll get rid of that. and then I think that'll be a huge jump straight away. Yeah, but my VPN asks, oh, it's just that CPO file. Like, each time now, like, it knows that it's the problem.
*Speaker 1:* Where?
*Chris:* I think it did, right? Maybe I didn't on the ZazigV2. Yeah, I didn't. I should do that there. Cool. Which do you want to talk through your first or should I talk through?
*Tom:* Ah, so much. Well, first of all, give me the top level view. Do you think we have some... Having worked in this for a few days, do you think we have something here?
*Chris:* Yeah, 100%. It's the most exciting thing I've worked on in years.
*Speaker 3:* Easily.
*Speaker 1:* Yeah.
*Chris:* I'm working till midnight, because I can't put it down. Yeah. It's crazy. It's so exciting and I'm like we need to get this out because someone's gonna do this and whoever's first is gonna get a big prize and it's awesome.
*Speaker 4:* Cool.
*Tom:* There no agree. I was like, I was away this weekend on a writing thing in Aberdeen, but what I basically meant was I went to like a one hour session. I spent the entire rest of the time in my hotel room. I'm like, this is good, this is good, looking like, yeah!
*Tom:* I'm thinking on this dude, I'm thinking on this, like... trying to get.
*Speaker 1:* Yeah.
*Tom:* And then.
*Chris:* For sure. And we've like scratched the surface as well. There's so much that you can do once it's working.
*Speaker 3:* So yes, definitely. Do I think.
*Chris:* We should look at raising probably. believe?
*Tom:* Yeah I was, I don't know, I did a world I've said no because then it would have allowed us to not have to deal with you know.
*Tom:* Yeah, I think so thinking a little bit about those three bottlenecks compute tokens and and people like us at the moment yeah if we raised we could we could actually like just spend it all on computing tokens zero yeah right we're gonna have just yeah like because
*Tom:* because it's automated so the only thing that holds everything exactly.
*Speaker 3:* like.
*Tom:* So, so if the meeting bit working dog food itself then we just need stuff to be able to move faster. Yeah, well exactly. Then the question of people I don't know. Like, as I said, but again, as you say, I think it depends and again, we'll see once we get that compute a bit faster.
*Chris:* Because like I said, we get the flow working well and it is actually just improving itself.
*Tom:* Yeah, you probably just need some like juniors not even developers, but people like who can just do testing
*Chris:* Yeah, this whole job is for front like user testing nearly
*Tom:* You know this whole service where you can let our source AI tasks to humans Yeah, there could be things like that that we might be able to use Well, it's done our...
*Chris:* Potentially, it will again if it's... Oh, easy as well. If it's that, you could just choose one of those, like PA has a service thing. Like there's some of those where all they do is just jobs.
*Speaker 3:* Like this is just, yeah, I should be that simple.
*Tom:* Essentially generate a test script.
*Speaker 1:* And yes.
*Tom:* And they just need to go through it. Run through it exactly. I think of that and I'm like, what could they possibly do? do exactly the way in that regard.
*Chris:* Well, you'd hope you could, but I'm thinking there's like a short-term gap whilst you get that bit could. And I think that's how this is all going to be. I feel like you fill short-term gaps with people while you're at the same time creating an automated way to do that.
*Tom:* Yeah, like sense. Let me let me let me talk slow quickly.
*Chris:* So I didn't create a readme, see if it's not good.
*Speaker 1:* I'm sorry.
*Chris:* I'm sorry.
*Chris:* I'm sorry.
*Tom:* I'm sorry. Lots of split ghost determinals. I figured out how to split them all. So now I've got like different ones, then you can rename them as well. So I actually can see which ones are which and then a couple of them are opening, I have codex as well.
*Tom:* Directly open because I'm so low on Claude tokens. I'm having to run stuff directly in codex too.
*Chris:* I don't want to cool. You can see my screen.
*Speaker 3:* Yeah.
*Chris:* Okay, so if we keep, let's talk through the actual overall piece of this. So we have a local agent.
*Speaker 3:* It's a CLI.
*Chris:* You type Zazig and you type Zazig log in to start off with. And then you can log in using Supabase's like website log in. So you can choose, you know, Google, email, magic, link, etc. The next thing you can do is you can go to the Zazig setup and set up.
*Tom:* I'm already loving this. I'm already excited by it.
*Chris:* But the setup is pretty simple. So the setup is create company or if you're or join a company or if you're already in a company then the next bit you can do is create a new project, join an existing project, then you put in what the project
*Chris:* is about and connect your existing GitHub repo or create a new one.
*Speaker 1:* and quickly pour these in a slump, fire, scissors, and scissor.
*Chris:* I think that's all of them. And then that goes and creates your bits in the, so if you go over to Supabase quickly.
*Speaker 1:* I can't go back there.
*Chris:* Okay, so in Supabase, we have all these tables. We pretty much have a company.
*Speaker 5:* Yeah.
*Chris:* And you have user companies. So a user is connected to a company and can be connected to multiple companies and the other around. This just got added last night. So it's new. Then from that, you have projects. And a project has a repository.
*Speaker 3:* And then you have features.
*Chris:* So a feature is what you and the CPO talk about. Yeah, so these can be broken into multiple jobs, but a feature is more top level than a job.
*Tom:* We want a feature at the dashboard for X.
*Chris:* Exactly. Yeah.
*Tom:* So you do planning around a feature and then essentially that would get broken up eventually into jobs which is the equivalent of what we currently have as our cards right.
*Chris:* Yes, yeah jobs are cards exactly and only jobs go to the actual workers on the local machines.
*Chris:* or computers because there's Zazig V1. Yeah, so one of the other, let me go back to the readme, because it'll probably explain this here. So at the moment, this is how you run the local. So this creates a `zazig` command. This will get wrapped up eventually into more of a,
*Chris:* Oh, I'll create as a brew so you can do brew install zazig.
*Speaker 3:* Yeah.
*Chris:* Okay, then this is useful. So features have a flow. So features get created to start off with and they get created by either the user or by the CPO.
*Speaker 3:* after
*Chris:* the CPO has talked it through with the user and agreed it's ready. It moves into what's called ready for breakdown. Oh here's a good way of looking. Then at that point we have a a job that gets picked up by a feature breakdown expert. It's the current role I've got at the moment.
*Chris:* But they split that into jobs and this service is called breakdown.
*Speaker 3:* Yeah.
*Tom:* of the my cardifies skill at the moment.
*Speaker 3:* Right. Cool.
*Tom:* You might be in the next bit. You might be in the skill, by the way. You might be able to update the skill. Or create a... I was going to say, so I feel like your expertise on all this.
*Chris:* If you can go through and look at all of these steps and the role that's in this step and then how the best way for you to create the prompt all the bits that you're talking about.
*Tom:* breaking that into.
*Chris:* So the next bit is this, it goes to what's called building, but really this is the, it's now going through the job flow. Yeah, so I'll go down to the job lifecycle so you can see that next. So here's the job like lifecycle. Yeah, so it goes cute waiting for a machine with the right little slots.
*Tom:* Yeah.
*Chris:* Disguised. to a machine. Executing, so this is the agent actually running on the machine. It can then become blocked if the agent decides they need human input or whatever. They might actually be blocked because they need CPO input or someone else's input, not necessarily human.
*Chris:* We have reviewing, which is your current step of the four perspective as well as the codex. Yeah, and then it's either complete failed or And so at that point, when how features work is until all the jobs under a feature is done, it would stay in building.
*Chris:* So once all the jobs under a feature are complete, they then go to a special job who is called a job combiner at the moment, I call it, but we'll come up with a better name for it. their job is to merge all the job branches back into one feature branch.
*Chris:* because it's better for a human to test a feature manually than test a job. Right? You they don't care that it got broken into little tasks.
*Speaker 3:* Yep.
*Speaker 5:* Cool.
*Tom:* You can take that. At that point we, yeah, cool.
*Chris:* Yep. Then we have a verifier on the feature. So this is actually the automated verification. So when we created the feature in the first place, part of that job is to create the test which would approve. feature.
*Chris:* And so this verifier goes through that and then goes, yeah, it is actually, or no, it's got to go back in the steps. Then we have this deployer, so the deployer to test, which pushes it to a test environment.
*Chris:* And then it gets ready to test, so human tests at this point and the Slack thread opens for the approval, reject or fixes.
*Speaker 3:* And then it gets deployed to prod and complete.
*Tom:* So it looks good to me. So the only question I have is around methodology and whether we should be trying to do real kind of PRD led feature stuff. Because I think Claude is pretty good at doing a PRD, and giving like a full checklist of, yeah.
*Chris:* So I caught by this point I told it to do like TDD. Yeah, it's a test driven development, so it's gotta be fully, because you know I hated TDD when we did it, but I actually think at this stage where everything's automated, it actually makes a lot of sense to do TDD.
*Chris:* So it's like you create the test first, especially on a feature, and then everything is based around getting those tests to completions.
*Tom:* Yeah.
*Speaker 3:* Right.
*Chris:* And as long as you define the test well, then everything else is great. So that's the flow that's currently here. I think this ready for breakdown card, we can change the methodology nearly at that level to say this is the methodology used at this stage.
*Tom:* Because I've been thinking a lot about this. And I think there are two different kind of entry points into this. I've got a ton of opinions and knowledge. Yeah, it's true. In which case, the brain storming with it, you would... Then it would be on.
*Tom:* I would then get codecs to second opinion it, get a V2. If it's really complicated, I might red team it and get some adversarial stuff.
*Speaker 1:* Yeah.
*Tom:* Some adversarial review, do a V3, and then I'd be ready to do the breakdown. If I don't know anything about it, so like, I think some of the stuff around gateway and heartbeat and things that I was researching the other day, and this is the stuff I think could be an automated a little bit fully.
*Tom:* I think the CPU could be managing this itself, but... Basically, I had a flow where I got it to do deep research from two different sources, Gemini and OpenAI on a topic.
*Tom:* Like, go and learn about what does everybody in the developer community think right now about how OpenClaw has implemented identity, say, right? And if there's a repo
*Speaker 4:* That's coming up.
*Tom:* It can also do a what's called a repo recon where it clones it and then does an analysis on the repo itself to see what it can learn from it. It then pulls those things together and does a like a like a like a a summary up a deep dive that then it goes okay now compared against our code base.
*Tom:* like these are the bits we should be stealing and highlighting and pulling up and then it goes back into that other flow where it will develop stuff. So basically, it's like a few steps, which I think again, right now I can do as a skill and eventually it might be two roles.
*Tom:* It might be the CPO managing it with a subordinate.
*Chris:* Specials.
*Tom:* Actually, it can manage some of the flow, not you.
*Chris:* That makes sense. So I think, yeah, if you can focus on that's there Okay. that's gonna work, I think that would be great.
*Tom:* Is there a research stage in between these and do some of these things?
*Speaker 3:* Probably.
*Chris:* And I think we shouldn't be afraid to put in more steps here. So I started off by the way with like more steps and I just kept on being like, actually no, there's another step in here. And I'm like, actually the more steps, the clearer it is where stuff is.
*Chris:* and actually it simplifies stuff and you can have more specialists doing the task.
*Speaker 3:* So yeah I think...
*Tom:* Iteration stage there, especially if you're going, hey get both codex and jenn and i to take a look as well and then come back with their opinions. It like strengthens and hardens, they find just tons of bugs and they're like no that's never nice.
*Tom:* Oh yeah shit I didn't even think of that and then they put it on At the end of it you've got something rock solid and when they go to do the implementation it seems to be like
*Chris:* Binker that's amazing. So I was going to say quickly in the tables here.
*Speaker 3:* So the way all that works is you have roles roles have like prompts.
*Chris:* Okay, you might need to add additional then you have a default model in here and it launches that model.
*Chris:* I have skills as another bit in here, so it passes those skills over as well. But again feel free to add to this table and change this table. None of this is in any way being refined. I guess the other thing to note, I also have company roles, so it's possible for a company to override a role.
*Chris:* So actually you could have it that a company goes, no, I want to use Opus or this for this. type of role and actually my prompt needs to be changed for this, then that's what would
*Speaker 3:* happen.
*Chris:* The other one is we have this idea currently of memory chunks, but I think this needs to be, I haven't done anything on this yet, I don't think it's right, but I think this is part of it, is storing memory on roles for a company, maybe even for a project.
*Tom:* Rome's
*Chris:* the, yes, potentially.
*Speaker 5:* Okay.
*Chris:* Depending. So it might be stuff that it's learned when doing stuff.
*Speaker 3:* So you might say, right?
*Chris:* So say the, I'm the tester of this for this project. And I should have learned this about it. Then this is you could save it and then that gets passed across with it as well.
*Speaker 3:* So I have
*Chris:* not anything on this, but I think there's something around that piece as well.
*Speaker 5:* Okay.
*Chris:* Um, the other, the other which I haven't put here, there is so roles can be persistent here. So at the moment, the CPO is persistent.
*Tom:* Yeah.
*Chris:* So what that means is it automatically will put it on one of the local machines. And it's just sitting there all the time runners.
*Speaker 3:* Um, until yes.
*Chris:* So, um, not running in the but I have this Slack channel I set up with it, and then I can chat with the CBO through the Slack channel. And that's persistent, so it's constantly running, and then I can say stuff like, go create this feature, and it can go do that.
*Speaker 1:* Yeah.
*Chris:* At the moment, that's the CBO's any real one that's persistent for me, but maybe there's others.
*Tom:* Is it, but if you locked into her Tmux terminal somewhere, would you also see that thread or is it like a different background version of this?
*Chris:* No, it is it you can you can Tmux Tmux attach to that yeah um yeah that session the CPO session but it could be running on your machine instead of on my machine so it's just running on one of the machine yeah okay yeah there is a question as you say I will show you the
*Chris:* running on each machine and you can actually have it more in a terminal session. I don't know rather than Slack, because Slack adds latency through it, but it's not crazy, it's probably like a second.
*Chris:* So something again, I think as we start testing in the next day or so, we'll get an idea of which works best.
*Tom:* I'll be interested to see because one of the things I've been thinking about is, and this is something I think open-claught as badly, sometimes replies can be to verbios for the slack.
*Tom:* Like it might be okay to send a ton of text in a terminal, but if you were sending that to somebody in slack, it would be completely unreadable. So I think there's going to be a little bit of... Refinement by channel almost.
*Speaker 3:* Yes, yeah, yeah, agree. I had that straight away.
*Chris:* We are it's that of requiring back for me and I'm in parade.
*Tom:* Yeah.
*Chris:* As an example, and I was like, I don't want to do that. And then I'm like, oh, if this was like a big chunk, then I do kind of want it to do it in a way. It was like, I hate for this chat to be filled with like a big chunk of
*Chris:* So you nearly want it to thread at times when it's talking about something complicated. For like small chat, you don't want it to. I'm not out of interest.
*Tom:* Yeah.
*Chris:* But as I said slack is currently a, it's a backend piece.
*Speaker 3:* It's got nothing to do with the local version.
*Chris:* the other good thing I guess at this stage all the coding stuff we don't have to work about from sin direction only the email on that side of stuff if we when we start doing that side that's when we have to worry about it.
*Tom:* Directed against it then with coding.
*Chris:* Because the actual coding is running on a local machine of the person under their own Claude account. So you'd just be injecting itself.
*Tom:* never wouldn't isn't the issue still up. Somebody else could find a way of injecting you. So like you basically like could you be hacked by like you've set up Zazig you're running it as a company and some asshole gets it to divulge all your IP secrets.
*Chris:* You'd have to have a way to talk to it and the only way to talk to it is over slacker as an example through the CPO. So if they manage to get into a slack potentially, but otherwise that bit's actually fairly secure because also they're not hitting us. So there's nothing they can do to us.
*Chris:* So it is just if someone managed to get in, but that happens like if anyone can get into your system anyway, then all your secrets are gone anyway. So it's not that big of a worry. My worry is, as you say, it's more if someone if we're reading emails as the CEO
*Chris:* At that point, you're then at risk because there's externals coming in but at the moment where I'm really working with internals
*Tom:* And ice sculptures My general view is what what OpenClaw did right but didn't hasn't done well is this idea of having this gateway in between the adapter layer that the channels coming in as a gateway, almost like a transformer between that and the system, which allows it to
*Tom:* kind of cue bus messages coming in no matter what channel because you can integrate many WhatsApp and telegram and Slack and whatever. But I do I do think that that layer could actually be a a layer that does actually manage the security of those inbound. stuff as one accents.
*Tom:* And that does a, okay, it's never actually going straight to a prompt, we're actually rooting it via a some kind of agent that's kind of doing or even just a script, it's not an agent, but there's some some way of being able to check for these things, I don't know. That's a nice accent.
*Chris:* I actually think. I think but there's two things that make sense with this why we set up weirdly, which is yeah I think if If you make everything go through the back end that's external, you can then have it like an layer of security there.
*Chris:* And but everything that's coding base, if you keep that local, who's that there?
*Tom:* Can I see that? Hi. Oh, when it's, when is it?
*Chris:* Are you big bear? You want to stand up and be big or you want to be small?
*Speaker 3:* You're big.
*Tom:* He's big.
*Chris:* Oh, you've been big.
*Chris:* Don't cover the screen. I need to quickly walk him to school and I'll be back. I'll be like 15 minutes.
*Tom:* I'll just keep seeing them in that. it's all one row.
*Chris:* Kåra kakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakakak
*Unknown:* Jag har en kring.
*Speaker 6:* Jag har en kring.
*Speaker 1:* Jag har en kring. Jag har en kring. Jag har en kring. Jag har en kring.
*Speaker 6:* Jag har en kring.
*Tom:* Jag har en kring.
*Speaker 1:* is 10 feet. That is 1 foot.
*Speaker 3:* That is 1 foot.
*Speaker 5:* I'm going to get the top of the rock. Ready to go on?
*Speaker 7:* Tell me about the top of the rock. Can't tell.
*Chris:* Do you know you answer the top of the rock?
*Speaker 1:* You can't tell. I'm going to the rock.
*Speaker 1:* I didn't know.
*Speaker 6:* I don't think the artist is being so visible.
*Chris:* It was like crazy.
*Speaker 8:* It was like, oh wow.
*Speaker 9:* It's like the game, or the genius side. The two right over the scene.
*Speaker 1:* What do you think?
*Speaker 9:* Well, on the genius side, I didn't realize it was like chipping a dog off.
*Speaker 10:* Yeah, so this is where I, the cheap pubs just outside the two men just in the known sofa.
*Speaker 9:* I mean, people talk in the two minute thing, get out, go and have a chat.
*Speaker 7:* What do you do?
*Speaker 1:* You can't believe you can't.
*Speaker 9:* You can't do that. You can't do that. You can't do that.
*Speaker 3:* You can't do that.
*Speaker 1:* You can't do that.
*Speaker 9:* You can't do that. You can't do that.
*Speaker 3:* You can't do that.
*Chris:* I'm sorry.
*Speaker 1:* Yeah. All right.
*Speaker 7:* Please, please, please, the president.
*Speaker 1:* Yeah.
*Speaker 7:* Oh, actually, that's not the last one.
*Speaker 3:* Well, not.
*Chris:* Yeah, true.
*Speaker 10:* I just thought, yeah. Yeah.
*Speaker 1:* Yeah.
*Tom:* Sick.
*Speaker 5:* Cool.
*Tom:* Hey Tom.
*Speaker 3:* Yeah.
*Tom:* Can you hear me?
*Speaker 3:* Yeah.
*Chris:* Can you hear me?
*Speaker 3:* Cool.
*Unknown:* Cool.
*Tom:* Oh yeah, so that's the other thing by the way.
*Chris:* Sorry, what I was saying before. But by us doing the coding locally, it kind of means that the person who has project it is can choose kind of
*Chris:* any technology and they can install it themselves with the agent's help. Like as long as you add to your CLI, whatever, like, stupid base as a thing, you can use that, right?
*Chris:* Because we're not getting them to install it on our systems in any way.
*Chris:* True.
*Chris:* And so it kind of makes us very flexible, but at the same time we've got like, security as well.
*Chris:* It's like yeah surprisingly. robust system.
*Tom:* I think, yeah, that's interesting actually because it does solve one of the things I was worried about, which is how do you make this work for people that have some experience like you and me.
*Chris:* Yeah.
*Tom:* There's a word and YC founders that might want to use it as well as for people that like they never want to see a command like interface, right? They don't want to know that it
*Chris:* Yeah, but I think it's having the war up and then having commands under there you can do Which then yeah, let's just do both
*Tom:* Yes, can be telling you yeah, so with it.
*Chris:* No, so that's what I'm trying to make it in a way so that as you say I think Claude will be able to install us
*Tom:* Not my thought, but yes, that's my plan Conclaude itself also run us Yes, because it's got command line. Potentially. And he's and it might just go exactly on the cloud locally and it will be able to understand. It what's going on and if it's working.
*Chris:* Yes.
*Tom:* This repo, then it's them then almost we have like a. A cloud MD in there that roots it towards the right places. So it over gets overwritten by the main system. It's complicated. So again, we can figure that one out later.
*Tom:* So, so my stuff, I'd love to just ask about versioning and how we manage that because obviously we were. We've got the one still running we're developing V2. Yeah, yes, there's a bigger question around that.
*Chris:* Yeah, so let's say we get V2 running in the next few days. this. How I was thinking we would run V2 is... would have it so that v2 is running as like the local part is installed.
*Chris:* So it's running using the CLI and actually it's not running off the code base so that way then you would have it pointing at a repo for the Zazig project which is v2 repo and then it's making changes on the be to repo and then whenever
*Chris:* you wanted to with deployment, you would then go and update the CLIs of the, so then that way it's then running on the next version, point three.
*Tom:* So then, we said in that way you've got to worry about every time we want to do a new version.
*Chris:* Exactly.
*Tom:* Because I was going to say that I feel like that was only because this is such a big change. I do it this year. Like a micro exactly like a refact.
*Speaker 3:* Yes. Yeah.
*Chris:* But otherwise, I think yeah, you keep it on the same repo. But yeah, I feel like that's the process and not I'm
*Speaker 3:* Really comfortable with that.
*Chris:* I feel like it's a way you would do it anyway.
*Speaker 1:* Yeah.
*Chris:* How?
*Tom:* No, but how do you know with the old stuff's work, that you're deploying changes?
*Speaker 1:* Yeah.
*Tom:* Do you know whether you're seeing stuff that you've just changed or whether it's baked into the deployed version? Is that make sense?
*Chris:* What do you mean? So, okay.
*Speaker 1:* Yeah.
*Chris:* It depends because I actually think so again coming let's take a few steps back. I think
*Chris:* of the local version will probably be the limited anyway. I don't think that's where most of the intelligence of this product is. So I don't think that bit will get changed much.
*Chris:* I think the actual bit that will get changed a lot is the database and the structure of the prompts and how all that bit works as well as the orchestration engine.
*Tom:* No, I agree.
*Chris:* So I think yeah, we'll see those pretty cool. but I don't think we need to be doing CLI changes often.
*Tom:* Look up.
*Speaker 1:* Anyway.
*Chris:* I have a dashboard by the way as well.
*Chris:* I have running. I don't actually have any jobs at the moment, so I can't show it to you very well. But by the end of the day, let me... This is the link of a bit of auto updates off the Git repo.
*Tom:* So we want jobs and running.
*Speaker 1:* Yes.
*Speaker 3:* Yeah.
*Chris:* And what's step in the, it's meant to mimic now notion I updated it and gave it notion and said, I'm sorry, not notion, I'm Trello. And I was like, just make it look as similar to Trello as you can.
*Tom:* Because the other bit of that, I was, I'd know about you, but my thing in Trello, it's just like, so this is why I wrote, I wrote, before I knew you were doing this bit, I'm, we need to replicate from the existing setup. I've been... try low because we do need to disrupt it out ASAP for sure.
*Tom:* It's the number of times it's like I don't have I can't do this I can't ride to track like I'm like it's in Doppler.
*Speaker 3:* You've been idiot.
*Tom:* That's an other thing as well. Actually as an interface is improved a lot. It's great.
*Speaker 3:* Yeah it is.
*Tom:* But I don't think we will. So the back ends the flat end?
*Speaker 1:* No.
*Chris:* And yes, what's going to stay the...
*Chris:* It'll come back to me.
*Tom:* Doppler.
*Chris:* Doppler.
*Chris:* The CLI, the local agent doesn't actually need any environment variables at all to run.
*Speaker 3:* Good.
*Chris:* So, yes. So there's no dependency there. And so the person on their project could use Doppler or they could use ENV files or they could use whatever, that's their choices part of their repo.
*Tom:* But when we make suggestions, agree.
*Chris:* And maybe in the prompts of some things, we would be like, also maybe there would be like,
*Tom:* hey, just so you know, like ENV files. Yes. to cure because they're meant to be secret, but I can read them. Exactly.
*Chris:* Or I think the even bigger one is things like when someone chooses a bad CLI tool, and you're like, you could use that product, but I can't do all these things that I want to be able to do. And if I use this one instead, I can do it all for you.
*Chris:* Otherwise, you'll manually have to go and set this up because I actually think or CLI is is going to be one of our biggest problems.
*Tom:* to and lack of integrations like if we could one click, I don't know, use Supabase, like okay, super is going to be played the base and they never have to go into Supabase or see it exist. That is exactly.
*Tom:* I mean, if you get to this stage where you could literally just deal with everything then that would be amazing and I don't know how really. agree.
*Chris:* And I think maybe we should again long. a term on this, I think each integration should get given a score by us. Like we should be like this one's a five out of a hundred, you know, for these reasons. And yeah, I think everyone would appreciate knowing what makes a good integration.
*Chris:* Because I think that's what we got to with POS where companies believed us, they'd be like, when we said it was a good integration, they'd be great. And therefore it was terrible. They'd get that too, you know and they choose their pause based on it.
*Tom:* Let me run you through what's in my head a bit because I do with it. I've got your model open by the way. I'm going to just share my screen so I can click through. You can obviously click through. Right in place.
*Tom:* What I try to do is basically just get it in a series of iterations to kind of go and look at your stuff. Oh, let me just go to my door.
*Tom:* I've been trying to get it to iterate around. So it was going into looking at the orchestrator stuff. It was coming back to the things I was working on. It was trying to knit them together and then kind of doing these cycles. So this is kind of what I'm proposing really at the moment.
*Tom:* All of this is through looking at OpenClaw and going, this is viewed as the best in the world right now. Then... and doing some deep research around what everybody thinks is broken in OpenClaw and where it might be improved and is heading in the future but no just built it yet.
*Tom:* Coming back and then doing a number of iterations and going well how like with my views this is what my opinions are on these things like how do we shape something and then try and put it all together again in a form.
*Chris:* So that I want to give you on this that I think you need to add in, which is something about where these pieces sit compared to O company level and then project level.
*Speaker 1:* Yeah.
*Chris:* But is there certain pieces of each of these, which is specific for a particular project, compared to an overall for the overall company or knowledge on that if that's an exam.
*Tom:* So personality, let's just quickly run through, so at a top level, the problem with OpenClaw is the identity is completely malleable. So it can it can change and update its own personality and that's viewed as cut-cut community.
*Tom:* But it basically means it can be anything and I think we don't want that. We want a slight bit of personalization but we want essentially makes sense because just yeah and you want consistent yeah there's the role prompt which you know skills obvious
*Tom:* doctrines and canons which is about knowledge by the way what you're saying on
*Chris:* personally there's quite interesting because there's actually something there which is like the company has a personality and then the employees under that company or only deviate a certain amount. from that overall personality.
*Chris:* So like people who work at Microsoft, there's a certain personality isn't there? That's the Microsoft personality and then there's something about if you went and worked at like a super fun company that's known for being fun.
*Chris:* There's a different yeah, personality for the whole company and then yeah, you fire around that don't you?
*Tom:* I think about that, it makes sense.
*Speaker 3:* Yeah.
*Tom:* So not doctors and canons all go into depth and then memory, which is what they remember, which is what we're talking about a little bit in the database. And then saying there's the Cheers workers. So employees and contractors, the execs you are the people you engage with directly.
*Tom:* employees might be people that the execs engage with directly. but they may have some degree. They may still be equipped with domain knowledge.
*Tom:* And contractors, they may be like the equivalent of sub-agents now with problem with sub-agents is you can't equip it with anything like they are literally just a bland model. So these are people literally are dispatching stuff too. And then they're not in your employees' stack, but I might be um
*Tom:* really deeply specialized that one particular thing I'll come back to. Curity testers, a legal review and migration specialist. There'll be in everybody's stack, but you'll never see them as part of your employee base when you're picking and paying for who you're hiring.
*Tom:* They'll just be like resource and you might pay for them on a perjol basis. I don't know. And then basically what happens is we assemble the prompt stack from all of these things but we're using So there's some above the line stuff, the personality prompt, role prompt, what you know.
*Tom:* Sorry, not what you know, but what you believe, we found this to be really important for LLMs, that saying what you believe about things gets better outcomes than saying what you know. Which is a difficult research. Yeah. The knowledge that you know about, but not giving it nice.
*Tom:* it's just saying as thinly as possible the...
*Speaker 3:* Right. So you're saying stuff like this, as an example, if we were building full of flights, you might have links to every API doc of all the POS providers that you work with.
*Speaker 1:* Yeah.
*Speaker 5:* Cool.
*Tom:* In the person's role, whose job it is to know about those things. about pause integrations.
*Chris:* Yeah.
*Tom:* If I were the integrator, was it an example? The O, part of my job was...
*Chris:* You wouldn't, I...
*Tom:* Good one, every single YC document on how to write a deck. Yeah, that would be nice.
*Chris:* Canons.
*Chris:* Okay, I like that. I like all. Yeah, I think that's cool.
*Tom:* Canons, is you could potentially give it books that are like... Here are the 30 books related to your area that have viewed as the best. source of knowledge for this job. So if you were a senior software engineer, we might curate the 30-year interest thing.
*Tom:* It could even be there is a way of buying that as a package or subscribing to it as a... Like you can upskill your people by giving it access to a library of resources.
*Speaker 3:* interesting. I like that.
*Chris:* And the sorry, coming back to the whole company versus project, do you think you would have doctrines for project itself rather than these specific ones that are like just around that particular project you're working on rather than the
*Tom:* I need to think all of them at the top level.
*Speaker 3:* Yep.
*Tom:* Right, what you don't want to do is pollute too much the context window. So you have to be very careful around. Yeah, exactly. There might be some shared project.
*Chris:* Yeah, exactly.
*Chris:* Well, I'm just thinking, you know, when you start off with a new project and people have certain docs that they send out, they're like, here are these things that are important to this project as an example. and sometimes it's for not just the technical people either as you say.
*Speaker 3:* Yeah.
*Chris:* Like, it's not like stuff you can just put in the GitHub repo.
*Tom:* It's like.
*Speaker 3:* It's.
*Speaker 1:* Yeah.
*Tom:* Also, I think above all of this, we might have at a top level, kind of you as a founder might set the goal, your goals and priorities for the company. And I do think if you're saying project, you should be setting up your goals and priorities for that project. Just sure.
*Speaker 3:* Yeah.
*Chris:* Thank you.
*Tom:* Everything below the line is then around what they call progressive disclosure. So the idea is to really just not pollute the context window, but you feed it out. So it knows these things exist and it can cascade down and find them if it needs to. Which is how skills work at the moment.
*Tom:* Skills have a... it knows there are skills, but it doesn't pre-load the skill. It just knows that it knows all the skill can do. it has some, yeah. And but also it is able to go, oh, the user wants to, I don't know, create a job or a feature. Do that.
*Speaker 5:* So yeah.
*Tom:* Right. Let's go into some of the bits or straight to obviously that you've been building and I don't need to explain this to you, but I just got it to try and put it all down for me. So it was explaining to me how you put things together.
*Speaker 4:* Right.
*Tom:* Personalities, at the moment, the idea how it works is that there are dimensions of the personality at an underlying level. So there is all numeric on a 0 to 100 scale.
*Tom:* And we measure them across different dimensions, verbosity, technicality, formality, productivity, directness, risk tolerance, autonomy, analysis and depth and speed bias. Okay, speed advice. And then We assemble those into archetypes.
*Tom:* So you don't need to think about any of those, but underneath it, we produce a number of archetypes that you, as the customer, will select which one you want like you're hiring, and you could change them around to see which one you like more.
*Chris:* I'm assuming, yeah.
*Tom:* Here come.
*Chris:* This is more of the exact level, isn't it?
*Tom:* I totally have the exact level. Because at the level beneath it, you wouldn't necessarily.
*Chris:* you don't can there is no
*Tom:* Yeah, so the employees have a light version which is just to make sure like they don't have a philosophy. We don't care about what voice they use. And it patterns in herative more values, but they do have a couple of role rather than things. Right, so but no archetypes.
*Tom:* So yeah, I might want a CPO who is a bit like Ricardo founders instinct. The market will tell you what's wrong faster than and research will at the doctrine. And I might have a translator because I'm non-technical as my CTO and the translator says, explains tech in business terms.
*Tom:* And it's the ideal one for non-technical founders. Okay. And then I can trial them out and I can change them easily. And I'll get a different tone of voice, it will explain things differently to me. but we'll also have an impact on how it should be.
*Speaker 4:* things.
*Tom:* So this CTO is like you know boring technology is a competitive advantage. It will it will give you towards safe and stable good solid choices that we know are the right ones to make proven by the market. Whereas you might have one that is much more like okay I'm thinking to
*Tom:* things based on where things are heading, not where they've been right now and so on, so you could shake it up. And that is, we think, is better than OpenClaw. OpenClaw does has Soul.MD, which is one markup file, it can self-modify. So you can see it's vastly different.
*Tom:* And I think it's, I think that it is viewed as a security risk, Soul.MD, basically, it could be. makes sense. Right, I won't go through all of it, but knowledge. Mm hmm. So you've got skills, then doctrines, then canons.
*Tom:* So skills, how to work, doctrines, what they believe, canons, what they've studied. Obviously, it's explained a bit about how canons work. I think doctrines are the interesting ones that just dip into quickly. Go on.
*Speaker 10:* Well, I was just gonna ask on skills.
*Chris:* So our skills company specific.
*Tom:* I think we would. deploy with a bunch of skills. Yeah, to start with what we will essentially do, the more I look into skills, they are like apps. They're just renewable apps. So they have a process to them.
*Tom:* And they can execute scripted information and they can also have triggers that load other apps. Other other skills. So they're quite dynamic thing. and basically I could equip the CPU over example with a very complex skill for taking it through the entire research pipeline.
*Tom:* That basically tiaq cpu how to do how to take something from deep research to a to jobs on our board and that could be one skill that triggers all those other skills as it goes through and might engage with other staff and basically it's our program it's our program for yeah DPO go from here to here
*Chris:* go from it.
*Speaker 3:* Yeah.
*Unknown:* Cool.
*Tom:* So I think we can we equip with them. I do think as time goes on, we will take some from other places. Okay. Companies could train up their own skills and I think they could self learn some skills as well.
*Chris:* Okay.
*Chris:* So you're thinking probably for version one that goes live eventually. Companies won't have the ability to do skills and start with it our skills for our work employees to do their tasks in a way.
*Tom:* I'll say yes but if we are allowing people to access their own this through the CLI and Claude directly in the schools they already have loaded in their Claude we will be able to run.
*Chris:* Okay well it knows that it's there.
*Tom:* Unfortunately, that's just how it works. Well, that's great though.
*Chris:* I think that's all benefits actually.
*Tom:* I agree because I think this is whole thing of yeah, it just means it works with what you're already doing.
*Speaker 3:* But as you say, it could be yeah.
*Tom:* Ability with skills as well though. So yeah, just have to be this is going to be like complicated terms and conditions, but like if you install the skill directly from a door. exactly. Both of them are on mute.
*Chris:* you. Yeah.
*Chris:* Yeah, exactly.
*Tom:* Um, canons of all doctrines, if you guide how agents use skills, I need to figure out a little bit about how some of this stuff gets implemented. Like the skills is baked in. What I'm trying, what I think is I can maybe use skills as a wrapper for doctrines and canons. So I think.
*Tom:* Well, maybe I don't know, I feel like
*Chris:* It feels like would be in the database table.
*Speaker 3:* You have an extra table, which is the thing of roles to, especially sorry, company roles, two doctrines.
*Chris:* It's like a link up.
*Speaker 3:* And then it gets sent across during.
*Tom:* Is it is a bit more like prompts? So it's like here.
*Chris:* Exactly, so I think that's easy.
*Tom:* Canons is maybe more difficult and I was wondering whether we have been researching the latest thoughts on Rag and If you've got quite a larger amount of information in that canon I think
*Tom:* We may still need to think about some sort of like things like pine cone or vector-based databases to hold it but Anyway, so I mean I think that's the nuts and bolts of it already in the lock. of the rest of it is being worked out and then essentially what happens is it all gets
*Tom:* the prompt basically what we'll need the orchestrator to do is essentially go together.
*Chris:* So by the way you can do vector base within supervise.
*Speaker 1:* Yeah. Yeah.
*Chris:* There's an extension which you can store index and query vector embedding directly in the postgres, but which is super nice.
*Tom:* It's really good to get. Right, yeah, orchestras all need to put it all together. Assumpt like an assembly. Right, so when it's sending down, it's not just sending down a prompt, it's sending down the everything. And this, in a... By the way, it's already doing the...
*Chris:* Oh, sorry, one thing to show you in... Quick, one feel I didn't show you. So within Supabase, in the...
*Speaker 3:* job stable.
*Chris:* That's no jobs. There was the other day within here there is, you know, it's changed.
*Tom:* Why was the completed jobs? Why don't we see them there as well?
*Chris:* Yeah, but I wiped everything last night. Firstly, there's this rule log, so everything that gets output by the like within the session goes into this role, so you can go back and reread it to see what exactly happened during that job.
*Chris:* Because for debugging, I'm like we need to know exactly what it was.
*Chris:* But then there's also...
*Chris:* This is the problem.
*Chris:* I've started doing things better, but... This is why we said it.
*Chris:* I'm going out of the back in. I had a feels in here before. I wiped everything yesterday, which was the assembled context. I called it.
*Speaker 1:* Yeah.
*Chris:* So the orchestrator is already assembling the context from a few different things, from the roles, from the skills, from, et cetera.
*Chris:* And so for every job, I was getting it to write exactly what that assembled context is and then store it in here. So you know exactly what was passed across to the session.
*Chris:* So again that way we can look back and go okay this is what
*Chris:* decided to do this is what we sent exactly across.
*Chris:* What should we have sent?
*Chris:* Let's test a few different variations to see if it then comes out with a better outcome of doing that job.
*Chris:* And so yeah, I'll put that field back in because I think it's super useful. And it's the thing that you can work on is that is a sample context the right word or what did you call it?
*Tom:* Well, it's a prompt stack.
*Chris:* You don't, shall I call it prompt stack?
*Speaker 3:* Yeah.
*Speaker 1:* Cool.
*Tom:* Yeah, that'd be really useful.
*Speaker 5:* Yeah.
*Chris:* So I had this, again, one of these things which is super frustrating. So I hadn't linked my Supabase to my
*Chris:* my Supabase CLI to my project.
*Chris:* And so every time I made, I got my code to make changes to the Supabase, it was airing out to do it. But it didn't tell me why it was airing. And so it just said go run manually run these migrations for me.
*Speaker 3:* So I did that for a while.
*Chris:* I was like fine, I'll just run them over on superlates. And
*Chris:* this is not sustainable. I can't be manually running every migration.
*Chris:* So I was, okay, wipe the database and run all the ones that you've stored. And it goes, oh, you just need to link your Supabase to the thing and I was like, okay, link the Supabase and it did it. And then it ran all the migrations perfectly and I'm like, I'm sick.
*Chris:* Like I could have been doing that from the start. Instead I was like manually doing steps.
*Speaker 3:* Thanks for watching.
*Chris:* like we probably need to include in a lot of the prompts to say, don't expect like the human to do stuff for you unless it's like an absolute must do.
*Unknown:* Yeah.
*Tom:* So again, that piece is such a problem.
*Chris:* But maybe it's the doctrine, yeah.
*Tom:* So again, this is precisely what I've read somewhere, which is the research suggests an agent will... what an agent is called it believes will trump a rule because a rule it might go well that rule doesn't fit but if it's forced to interpret a belief then it will
*Tom:* actually do the thing anyway so it would it's almost like how do we take rules and frame them as doctrines so like the the the doctrines should be I believe it is better to try and make sure users never have to do X. or something like that.
*Chris:* Yeah, but I also think there's this thing of all the eight, all the AIs are trained on wrong versions of the CLIs.
*Tom:* Right. And so they always try commands that are out of date.
*Chris:* And then it always fails. And again, if you could tell it, but no, the website, this website version of the documentation is I believe. that the website documentation is always correct.
*Chris:* Compared to the CLI, and then you then give it links to all of the website conversions of stuff like it knows everything about Supabase.
*Tom:* There is a skill that has accessed information to all of the current website APIs. I installed it there. Okay.
*Speaker 3:* Right. I'm sorry. I really.
*Chris:* because I'm on my own, because that's a bit for me at the moment.
*Chris:* I find it. I would say 95% of the time the CLI commands it tries are wrong.
*Tom:* The great. Which is this trying this, which is a waste of time.
*Chris:* Yeah, exactly.
*Chris:* Well, also it tries it ends up doing a hacky way. Because like how it tried. So I gave it the Supabase CLI.
*Chris:* And in the end, it was trying to do like connect to my postgres database, manually using this.
*Chris:* back in half to then update it.
*Speaker 3:* And it's like, man, no, like you've got to see a lie.
*Chris:* What are you doing?
*Chris:* And it's because it didn't know how to use the CLI.
*Speaker 5:* I've got this a few times.
*Tom:* It's trying to load an MCP. Then trying to load a browser. And then I'm like, escaping here. No, no, no, no, no, no, no. Yeah.
*Chris:* It's exactly.
*Tom:* This is this. I'm seeing people face it with OpenClaw as well, which is helping the agent. Remember what its capabilities are. Is really yes.
*Chris:* We're also just this thing of if you have a CLI, it should 100% be how you do it. And if the commands for the CLI don't work, go look up how to do it. I don't move on to the next thing.
*Tom:* So these, but that's.
*Speaker 1:* Yeah.
*Speaker 3:* Yeah.
*Tom:* So before this. kind of touch-brood proofing on some of the other things I'm thinking about. There are very detailed implementation docs for those things. But what I didn't do is use my current skill cardify to turn them into cards in Zazig V1 and start building them.
*Tom:* I did some little bits and pieces, which is why you can see in the Supabase table is a personality's thing. But I basically thought what it might make sense to do is just to hold until That's like at you. I think it's right. I think there are things that the two should implement not V1.
*Tom:* So I think we'd wait.
*Chris:* I don't think we should be doing anything on V1 anymore.
*Tom:* So I think once you get V2 up and running, then I'll let you all work together to create a new skill which replaces Cardify and allows us to basically spin out those documents into jobs. Oops. Um, go home.
*Chris:* I think that's right. I think so, I've decided now where I'm at right now. I'm not gonna add any more features. I'm just about getting it to production and hour so that we can start using it and then we can start actually iterating.
*Tom:* Right, let me just tell you a couple of, are you still, can you see my screen still? I'm just gonna go back. I can't, but I'm just looking at the website anyway. The couple of minor things just to go through gateway.
*Tom:* This was just, this is just the result of the huge deep dive I'd again did into how OpenClaw works when it comes to messaging. And it's not critical right away, but it will be critical once we...
*Tom:* The way that I'm kind of thinking about it is that we may have Slack as a key channel, but we may also have our own kind of web. web, yeah, and it may be what I bring Brutalion is I'd love to be able to have a very long phone call with my CPO over duplex.
*Tom:* And that might be, but it's going to have to happen by our gateway. So some say we're going to need to build a proper one that just sits in the middle of a platform and they are to exhibit.
*Speaker 4:* basically.
*Tom:* But that's it's a little bit early stage is more to be done but what it basically did is just did a repo recon on through or four different agents to try and pull out how they worked and then did combine it on how to improve these things and that's what we've got. So let's start their waiting for us.
*Tom:* Same very much.
*Chris:* But well, she's gonna say I actually ended up building a slack.
*Chris:* So the way mine
*Chris:* working as a Zazig Slack app that you install and that does all the connecting.
*Chris:* So if you're end up doing any Slack stuff, you can use that Zazig app to do it in.
*Tom:* Yeah, when I, my little, the original ones I have were also mini Slack app. Slack app. Yeah, so the one that was like CPO and stuff. Yeah, yeah, I think I think those will still exist they'll just plug in Instead of going via a webhook, they'll plug into a gateway. So it's just the... No sense.
*Tom:* ...are in the middle.
*Speaker 1:* Yeah.
*Speaker 3:* Yeah, it's a...
*Chris:* It's a weird one at the moment, isn't it? Because I feel like Slack's definitely not the right tool for this.
*Tom:* I think today about whether we should build a Slack alternative that was more suited, but I think that can be a long-term thing.
*Chris:* Yeah.
*Tom:* Um...
*Chris:* Yeah, it's interesting, isn't it?
*Speaker 1:* Yeah. Yeah.
*Chris:* Because that's the other bit.
*Speaker 3:* Slack is kind of built for bigger teams.
*Chris:* Like you can see this is going to end up. Most companies are going to be very small.
*Tom:* I agree.
*Chris:* But with like lots of data happening, like lots of, yeah.
*Tom:* Want something that feels a bit more like WhatsApp. Then Slack.
*Speaker 1:* Yeah.
*Speaker 5:* A little.
*Tom:* Yeah, I don't know.
*Chris:* It's probably more visual though as well. you say you probably want to be able to have dashboards and stuff in it. Or like an easy way for it to build stuff you can see within it.
*Tom:* True, that would be very cool because that's going to be the major problem. There's like, there's sort of been thinking through, let's imagine it's building you a, and I for an app, like to get to it to pop up and slack with any you've got to be able to click on something and see. what it's doing.
*Chris:* Police are closed.
*Speaker 1:* Yeah.
*Chris:* Interesting.
*Tom:* Yeah, we'll think about that on the roadmap. Trick as an events. This is this is what people think is actually the kind a magic bit of OpenClaw. So the idea is, OpenClaw has things it responds.
*Speaker 4:* to quite proactively.
*Tom:* One of those is the heartbeat system effectively, which is literally just something that runs every 30 minutes that you can give instructions on what to do every 30 minutes. And it's very, very basic amount.
*Tom:* It's a prompt that runs every 30 minutes on an background agent that keeps it doing things, which means you could, in theory, have it checking jobs for you and kicking off. activities. It will be part of the orchestrator basically. It will make sense. Then there's the scheduler.
*Tom:* So like every 24 hours run this, which is basically the or current jobs or whatever. There's a wake service, so a poke mechanism to wake agents when they've got pending events. This is something new, I think we would be doing now. I don't think this quite exists at the moment.
*Tom:* There is an events queue. So if things are happening, we would be able to know that they are happening, and it should maybe trigger stuff. So I think, because again, I think it'd be interesting if a GitHub PR is merged, that our agents could proactively know about it.
*Speaker 1:* in it.
*Chris:* Yeah, Mike. Thanks.
*Tom:* I'm not going to go to all this in detail, but it's all there. We're not ready to build any of this yet, but I think it would be one of the jobs that will be thought on you to look through in detail and go, yeah. Because I do think this will be the, this will be magic because it will feel proactive.
*Tom:* You can buy all of these, it gets like working autonomously in the background rather than you prompting it.
*Chris:* Make sense.
*Chris:* Is the difference between Claude code and this.
*Speaker 4:* Emergency stop.
*Tom:* This is something I've come across, which I've seen people trying to like that. The open floor is doing stuff.
*Chris:* Yeah.
*Tom:* Stop it because they're trying to sell it to stop it is running around. I think it's really interesting. Yeah. Absolutely. Let's build this in from the beginning, just in case.
*Chris:* Yeah, make sense.
*Tom:* Restart recovery because as a I said to you today, my, my one died after I sent it to five minute voice note. I haven't even bothered to go in and do it yet, but it shouldn't need me to. It should just be able to restart it.
*Speaker 1:* Yeah.
*Chris:* Well, I have this issue at the moment, where it's a ZB1, is when stuff dies, you just kind of, it's stuck. You have to let unmistick it, and it's painful.
*Tom:* This is some of the go-wrap straight from infinite wisdom, just around or governance basically. And every single one of them will have a governance module, which is this charter. So the idea is mandate, that will shout, this is what you shall do, and the contradictions that cannot do.
*Tom:* And hopefully it goes slightly better for us than it did for.
*Tom:* But what I think it allows us to do. is to say like in this instance,
*Chris:* yeah, yeah, nice.
*Tom:* The lap with somebody else's job role. Yeah, and makes sense. Yeah, never, never dispatch agents directly. I don't know where I've got one in, but might be, yeah, no, actually that makes sense. The CPU should never be the one actually doing the work. So cool.
*Chris:* Well, I was gonna say, I feel like one of the ways we can, well, you still have to do this, spit. I think it was a general rule, exec should never be in our pipeline.
*Tom:* Yeah.
*Chris:* So for me, exec stood outside at the pipeline of jobs and features. So at the moment, I's not true with the CPO because that's who you chat to. Maybe just the creating cards, it's fine.
*Tom:* Don't you would help create the job? Great.
*Speaker 3:* That's true.
*Chris:* But yeah, none of them should be doing any work in gear directly.
*Tom:* The seat.
*Speaker 4:* Yeah.
*Tom:* Should potentially be able to create jobs, I think. Create jobs, but not do the jobs.
*Speaker 3:* No.
*Chris:* And I think if we keep that as one of the key command rates, I think that helps a lot. And then as you say, actually, the majority of their jobs is this idea of running schedule things that go and do stuff. As you say, to have magic happen.
*Chris:* Yeah.
*Chris:* And a lot of that is reset.
*Speaker 3:* Sure.
*Chris:* And then, yeah.
*Chris:* And then creating cards from that research or doing stuff.
*Speaker 5:* Yeah.
*Tom:* Yeah, I have this idea that if I can get something that is pulling and listening to Twitter in real life and pulling out signal connected with the area that your company is in.
*Speaker 5:* Yeah.
*Tom:* Actually that makes sense. Gather ideas that it can then deep dive into.
*Speaker 5:* Yeah.
*Tom:* So I'm kind of thinking just the whole product development thing. We're going to be interested. Yeah.
*Chris:* I even think competitors like what they're doing, like monitoring competitors.
*Tom:* The mark. Like one of the things you're going to have. Yeah. The team do is to go. How do we create a It's not just about building a load of features, how do we build something that the market will want and therefore even like how do we?
*Chris:* Yeah, no talk to customers.
*Tom:* So how do we?
*Speaker 5:* Yeah.
*Tom:* An idea.
*Speaker 1:* Yeah.
*Tom:* And we've got to assume that the user, our user, our founder may not know how to let you even need to do any of these things. nothing. So, are exact. Yeah, exactly. And hey, this is what we need to do.
*Chris:* Yeah.
*Speaker 3:* What exactly?
*Chris:* Yeah, yeah, we should be launching this product. The best way to launch it is product hunt for this. But this is how we should do it.
*Tom:* I was thinking though, it would be kind of interesting if this was a bit like a sin game. This is this is where I guess we're really addictive. Do you remember like in civilization? And the advisor. Yeah.
*Speaker 3:* We
*Tom:* we need to go to war with this country and his like option one two and three. But I think at the branch of the skill at the moment kind of works like that.
*Tom:* I wonder whether you could create something like that with strategy and basically your chief marketing officer is like, hey, we should be targeting like this group of people in this way. Here's my recommendation. Here's a couple of other choices if you don't like my recommendation.
*Tom:* Of other ways we go, or you get to tell me what you think. I've been, yeah. Yeah, one.
*Speaker 3:* Yeah, yeah.
*Tom:* The brainstorming skill is incredibly addictive, but if you just had that, yeah.
*Speaker 5:* Exactly.
*Tom:* Basically occasionally was like, hey, here's a big decision. You feel like you're doing something, and you're doing the business. Yes.
*Speaker 3:* Yeah, it's cool.
*Tom:* Like a game, I live.
*Unknown:* Yeah.
*Tom:* Yeah, I'm the fucking boss and I'm telling you what to do. And I want to see what the next thing is, you know.
*Chris:* Man, it's so interesting if you took all the, everyone's financials and you created a leaderboard.
*Speaker 5:* Yeah.
*Speaker 3:* Like. Yeah.
*Chris:* Maybe you could make that optional, like you can opt in to the leaderboard.
*Chris:* Yeah, because you see all these companies come out and they proclaim on X that they're doing this much MMRR and stuff
*Speaker 3:* And so imagine if we just yet were like, here's here's everyone's actual everyone will be watching it
*Tom:* OpenClaw bots made 4,000 right
*Chris:* Yeah, well exactly and it's all bullshit you like you like why don't know like it could be true
*Chris:* We had our own thing.
*Chris:* It's like the ultimate game, isn't it? Cause I thought about this by the way. I was like, if farming became automated, you could make farm bill, but it's real farms. And I'm like, how fun a game would that be? Like, you're like, I'm gonna go plant wheat in my farm.
*Chris:* And then it's like, yeah, let's go.
*Chris:* a machine actually goes and plants wheat. and it's like, okay, and I'm gonna do this and actually that's yeah.
*Tom:* Approach of things like civilization could just be a system for how we will manage large-scale stuff in the future.
*Speaker 1:* Yeah.
*Tom:* Because there's always time in between like a civilization, but you're onto the next thing, and see like, oh, I've dreamed that... Um... That, uh... That, that, that bill...
*Chris:* things running.
*Speaker 1:* Yeah.
*Tom:* The build and mean exactly when that's completed to me like, oh, yeah.
*Speaker 1:* Yeah.
*Tom:* That.
*Speaker 1:* Yeah.
*Tom:* Can't feel like too much like a game because it's got to be serious, but it's got a that sense of real time strategy actually might be really. We're doing.
*Speaker 5:* Yeah.
*Chris:* It's like takes base real time strategy in a way to start with.
*Speaker 1:* It's not.
*Tom:* Oh, no.
*Speaker 5:* Like a...
*Speaker 1:* Yeah.
*Speaker 3:* Yeah, it's cool.
*Chris:* I used to really love that it was a game where it was like drug dealer, but it was tech space. And you had to choose what drugs that you would buy and then sell based on the price is changing.
*Tom:* That's awesome.
*Speaker 4:* Yeah.
*Chris:* It's amazing. Yeah. Yeah, yeah, but you'd be like, oh cocaine's in a few dollars a thing. I'm gonna buy a load of it. Oh, bye this much and then yeah hope the price goes up in a few weeks and it's true though like that
*Chris:* type of thing it's addictive to see what works like what your decisions do and don't do.
*Tom:* Yes so that's the bit isn't it's the it's being able to see the impact of your decision but you made this decision three weeks like this is like users love it. We built that. Users are like this and revenues gone up.
*Speaker 1:* Yeah.
*Tom:* The station a few weeks ago. We've, yeah. 100% of our users since then.
*Speaker 4:* Yeah.
*Tom:* Change.
*Speaker 1:* Yeah.
*Chris:* Yeah. Very tall.
*Speaker 10:* Okay.
*Chris:* Nice.
*Chris:* Well, I'm going to get fixing this, getting it live.
*Chris:* Come on. I think.
*Chris:* Let's get to V2 working the next day or two and then you can start working on all this side. I think this bit's key.
*Chris:* If you can focus by the way I think on the breaking a part of cards.
*Chris:* Like this whole CMCPO grading card, a feature and then breaking that into jobs. Deteration.
*Chris:* I think that's the one to focus on to start with.
*Chris:* And I'm the next one would be a job, all the bits that make up the, um, what's got the prompt stack?
*Speaker 1:* Yeah.
*Chris:* Yeah.
*Unknown:* Yeah, that's that.
*Speaker 5:* Cool.
*Chris:* Cool.
*Tom:* All right, buddy. All right.
*Chris:* Have a good one.
*Tom:* Take care.
*Speaker 3:* Bye.