*Tom:* I'm checking the super bass status and why did it... Yeah, it's actually a report.
*Speaker 1:* Oh no, I'm over.
*Tom:* It's showing all green and it's like, well that's not true. Let me um...
*Speaker 1:* Take your tuition stuff. I'm kind of sugar-yed. I'll show you what I can't.
*Speaker 2:* So I guess the main thing to note is so the way to think about it is master is now staging. Okay, so whatever we commit to master ends up in, well, ends up being automatically updated in staging. So let me show you how that works firstly. So in
*Unknown:* GitHub.
*Speaker 2:* Go have a look at what's a trace and this is e32 and the actions. So you'll see here these are all um commits that have happened here. If you have a look at a commit that's happened on master. So it automatically does a build and test, and then it deploys the edge functions
*Speaker 2:* on the super base, and then it pushes the migrations on the staging. But both of these are staging versions of super base.
*Speaker 3:* Yeah.
*Speaker 2:* So we have a Zazig staging in super base, and it's a copy of live. It's not an exact copy in terms of companies and stuff, but it's a copy in terms of everything else. So this It's automatically updated as you push to master.
*Speaker 2:* So in terms of the pipeline, so this is the pipeline, it's kind of simplified in a way. So it goes, you have,
*Speaker 2:* so we have, ready?
*Speaker 1:* Yeah. Yes, ready?
*Speaker 2:* Um, but you finished. down so it's being broken down. But the way to think about all these, I guess I can explain it pretty well. So in features, you have the statuses.
*Speaker 2:* And if a feature gets moved to a status, any of these new statuses, apart from building, but if we go break that break down, I think it's called breaking down is what the status is. It automatically goes in. to job at that point in the next cycle of the Cron that runs.
*Speaker 2:* It will create a job that's cute for breaking down that task. Okay, and so then that will then go and create all the actual code jobs. But once, sorry, and then the next bit of the, every time the Cron runs, the things that either looks for is. If there's a status.
*Speaker 2:* the job for that status is complete then it will move it to the next status. If there's a status and there's no job for that status then it creates that job and queues the job. And if there's Q jobs and there's a machine it will deploy them to that machine.
*Speaker 2:* They're kind of the three things so that it does each time. So if you ever want to reset something to run again... You pre-natured just need to either have the feature at the right status without a job. Or you queue the job and put it at that status as the feature as well.
*Speaker 3:* Yeah.
*Speaker 2:* So break down, create the jobs, building does the code. Once they're all complete, the status will move to combine and PR, which will create a job, which combines all the jobs back into the branch and then creates a poor request at that point.
*Speaker 2:* Verifying runs through all the tests of it and then if that successful it goes to merging, merging takes the poor request and merges it into master and then it moved to complete. So I guess the thing to note is you can put 20 jobs in here and it will just keep putting them into mass.
*Speaker 2:* and master will keep updating staging, but it won't actually change production. Okay. So then whenever you want to test against so staging, so there's two bits. So that's in my dashboard here at the moment. I've got environment staging.
*Tom:* Right.
*Speaker 2:* So that goes and looks at the database staging database to show here. can go environment production and I would show you the two base production data here.
*Speaker 2:* So we're going to have to think about with your new UI, how we would deploy the two versions, so you can be in staging or you can be in production.
*Speaker 1:* The best part of it. Okay.
*Speaker 2:* The other bit is in here, so we now have the, you can go to Zig whatever start and that is working on production. Oh, there's now scissors. staging, logging, or the zig-zag start, and it's working on staging instead.
*Tom:* Okay. I think I'll get that. Yeah. So, yeah.
*Speaker 2:* But so let me just one other thing before we go too far into that. So if we look at the code, for instance, so the thing to think about is when you're working in the zigzag aging. You're actually working all it's doing is it's just linking to the current working directory.
*Tom:* Yeah.
*Speaker 2:* Okay, so all you're actually doing is your whatever the code you're currently working on on your machine, that's what you're using when you're using the zig staging. In the repo now, we also have a, I don't know where it is.
*Speaker 1:* So under packages.
*Speaker 3:* No, he didn't go see a lot.
*Speaker 2:* Yeah, so under here.
*Speaker 3:* I see a lot of good ones.
*Speaker 2:* No, and the local agent. So whenever we do a promotion of. So we've got this new command called zig, zig promote.
*Speaker 1:* Thank you.
*Speaker 2:* Alright, so Zieg promote it goes and moves the superpace migrations copies the what's called edge functions as well moves them all that code over so when it was on master it pushes over to the production. but then also it creates this this folder which has like the local
*Speaker 2:* agent version, which is like the current production version.
*Tom:* Okay.
*Speaker 2:* So when you're typing the zig, you're actually running the local agent from this distribution folder. And so it means when we're working normally, you would just be, say you want to work on the ZV2. So you want to make changes to it, update it. you would actually just
*Speaker 1:* be running in the ZIG here.
*Speaker 2:* So you'd have ZIG start and everything you'd be doing would be using ZIG because you want to use the stable version of everything. So you're using the stable back end, stable everything.
*Speaker 2:* You would then have that work go through the pipeline, but you'd actually watching that work go through the production pipeline right.
*Speaker 2:* There we go. So that work would all be going through the production pipeline here. And as it goes through, it would all merge into master.
*Tom:* Yeah.
*Speaker 2:* But then whenever you want a test to make sure what you've built is actually working properly, you'd move across over to this staging pipeline. And you'd probably have a test company like I do. And then you You can go, okay, I want to test what's working. So goes is the staging start.
*Speaker 2:* And then you that would create a
*Speaker 2:* I'm in logins broken. But yeah, you blogging, you do start, it shows you the test company you've created on staging. Then you can talk to the CPO and be like, create me a feature that does blah blah blah. you can make sure it still goes all through the pipeline correctly and test whatever new
*Speaker 2:* changes you've made. And then if you're happy that everything's correct, then you go, this is the promote when you're like, yep, it's ready. That copies all those bits over to production. And then you're like, okay, production is good, it's stable.
*Speaker 2:* I'm going to go back to using the production version to do my next changes.
*Tom:* Okay. And how frequently should we really be doing that? It feels like we don't want to break every day, every couple of days. Okay, so it's gonna be a thing of, yeah.
*Tom:* The stuff in staging, make sure it's, like even if there's multiple things I've gone in, get it right there first, make sure it's full. Yes.
*Speaker 2:* And then exactly. I think the other bit about this will be we can then look at what I'm thinking we can create from this is nearly like a series of job runs that automatically happen when mastery to build.
*Speaker 2:* So you might have a that all this goes to staging and then actually what happens the first thing it goes and does the MCP command to create like it goes through the ZZ setup to create a company from. scratch in staging, it then creates five different features through the MCPM point and then
*Speaker 2:* it tracks to make sure in SuperBase they've all gone through exactly correctly with this data.
*Speaker 1:* And so we can really create like a automated tests, exactly.
*Speaker 2:* Like nearly that whole thing we talked about Uber used to do, which had a fake island or whatever it was that was always picking out people. right and it's nearly like we can create it so it is in the background always running
*Speaker 2:* fake stuff like you can nearly create an agent like whose job it was to do that type of stuff.
*Tom:* Yeah yeah okay okay I think that makes sense to me I mean I'm going to go over unfortunately this video is recorded because I might want to watch it a couple of times but I'm sure I got my head around that pretty quickly.
*Speaker 2:* The bit that's more complicated is. So it's nearly the next part. This is not just for us, so this is kind of everyone.
*Tom:* Yeah. Right. I need to be tied into the web UI in a way that non-techy.
*Unknown:* Exactly.
*Speaker 3:* Yeah.
*Speaker 2:* And I can see it's eventually not calling this this. like there's other stuff here like it's really yeah We need a way to think about, like as a good example, right, I've created this test company. The project is a website. I created this initial landing page with dummy data.
*Speaker 2:* Right, what I want to do is now see this in a staging, so the staging environment for this needs to be created on the cell automatically. And then I can then, as part of this project, can see. that staging version of this. And then, yeah. So actually, others wouldn't use this as a staging.
*Speaker 2:* It's just for us.
*Speaker 1:* For sure.
*Tom:* Like this is just, yeah, fooding the actual product that is complete.
*Speaker 1:* Yeah. Yeah.
*Speaker 2:* But for them, they would have a deployment somewhere of their product that they could go and see that's not live.
*Speaker 3:* Yeah.
*Tom:* So I think yeah, then along the pipeline and in the cron jobs, how often does the cron run?
*Speaker 2:* It runs every minute and then it's sorry, crons can only run a maximum of every minute, but the job within the cron runs every 10 seconds. Yeah, so the most you should wait is 10 seconds.
*Tom:* Um, quite quickly.
*Speaker 2:* Yeah, the only other one is, as I said, if a job is dispatched or executing and you kill the local agent, it takes two minutes for the orchestrator to re-cute the job. So because a heartbeat for each job happens to it. Oh, let me show you this by the way.
*Speaker 2:* So this is the other thing I should really take you through quickly.
*Speaker 1:* Oh another good thing.
*Speaker 2:* Okay, in Visual Studio I added this extension explorer disorder order. I recommend it. The reason why is so you can then sort using this button here.
*Speaker 2:* Yeah, you can't sort by time and I want to sort by time so that the last one's automatically go to the top.
*Speaker 3:* Right.
*Speaker 2:* Yeah. So then it means I can as I'm watching a feature go through the next one that pops up here, I go, okay. I now know this is the next bit. And then I can watch it. And as you can see, these bits, the pole job, that's the beat being sent to the the orchestrated keep the
*Speaker 1:* job alive.
*Speaker 2:* And then the key bits of this, by the way I always look at, is see this here.
*Speaker 1:* So when a team accession starts, it shows like what models etc was passed over to it.
*Speaker 2:* I don't know if you've seen, but so the logging for codex jobs is really different.
*Speaker 1:* I'm sorry.
*Tom:* This is a little bit...
*Tom:* was it able to work for you at least?
*Speaker 2:* It was, but I had to change it again. So my issue was, I was getting an error with codex 5.3, whatever it's called, the small one. It's bug. It said it's not allowed to be used with a thumbtip of subscription.
*Tom:* What subscription do you have on your codex?
*Speaker 1:* I think just a pro or Interesting.
*Speaker 2:* Yeah, so it said I couldn't use it with that subscription. Which was yeah.
*Speaker 4:* Okay.
*Speaker 2:* I hear the GPT 5.3 codex spark was not supported when using codex with a chat GPT account.
*Tom:* I think. Okay. That's why once I changed it instead to using just 5.3 codex it was fine. But which is fine for now because we're not running enough stuff in it. Codex is meant to be more efficient but we're not even maxing out my subscription. But again, I think so.
*Speaker 2:* I think so. So this is a coat-lex run through of like the pipe paint. Is the only thing I'd say is much harder to keep track of what's going on? Because like this is a code accession of it. And then this is like a, a, a clawed session.
*Speaker 1:* Yeah.
*Speaker 2:* And by the way, the main thing I look at when I'm doing a forward session, which I haven't figured out in the code accession is you can go to this bottom section. And the result comes in here.
*Speaker 1:* you can see quickly like what happened.
*Speaker 5:* Yeah.
*Tom:* Okay, well, it is looking at... By the way, and even in that's a worry, by the fact that's this old dumb wonder what it says very dumb.
*Speaker 1:* Oh, works completely. Okay, these are jobs, that's why.
*Speaker 2:* So all the non- coding jobs have to say this past thing.
*Speaker 2:* As a good example, verification completes this one.
*Speaker 2:* But yeah, I think part of what we need to do, by the way, is take a lot of these rerun them through everything to see is it actually being efficient, because we're not really looking at the details of this. it wouldn't surprise me if it's doing a bunch of calls that we're looking at.
*Speaker 2:* We'd be like, oh, why is it doing that?
*Tom:* I think I think I might leave that one for your head space to figure out.
*Speaker 1:* Yeah.
*Speaker 2:* I wonder if we should nearly set it up that every, I don't know, when he's job goes through a special thing where it gets checked by something to be like, is this like is there any errors? What are the issues here? What half of this?
*Speaker 1:* We better.
*Tom:* I like the compound learning loop.
*Speaker 2:* Exactly.
*Tom:* One thing, so one thing it highlights to me is right now.
*Speaker 2:* Yeah, look at this. The hook is blocking any get push or get force. Like it would in here.
*Speaker 3:* Yeah.
*Speaker 2:* So what the fact is trying to do that it's struggling is interesting.
*Tom:* Yeah, I mean, my stuff does that all the time because my hooks do block a load of stuff.
*Speaker 1:* Yeah, no.
*Speaker 2:* By the way, I looked at it and that rebases like a good step it should do. So we shouldn't, we shouldn't really not block it when it's doing it on the right things. We need to be more like specific with when it can do it.
*Speaker 1:* Good. potentially.
*Tom:* Totally open to changing it. I've been looking as well at the whole sandbox plus dangerously skipped commission stuff and I still think that's something we need to point birth. I don't know.
*Speaker 4:* It is.
*Tom:* It's in my head. So right now we have effectively really both of us that are running different subscriptions. that power our local slots, but we're treating the slots as all being the same because we're defining a model in the roles part of the database. You with me.
*Tom:* So, so right now we might have a role which is like senior engineer and we're saying that senior engineer should default to using codex spark. Yeah. Yeah, my slots support that because my subscription supports that because I'm on a codex map. you all don't. That's going to be the case as we go wider.
*Tom:* Like we don't we won't know model what subscription well we should we have to know we have to have a way where we can see what subscription people have and it will auto configure. Yeah, we've got two people like we do. It could be that it's allowed for my slots and not a
*Tom:* And a different model is used for your slots.
*Speaker 1:* Uh-huh. Yeah, it's interesting.
*Speaker 3:* Mm-hmm.
*Speaker 1:* Yeah, I hear what you're saying.
*Speaker 2:* The other bit as well is we're treating like a slot as the same no matter what it is.
*Tom:* They not be as well.
*Speaker 1:* No.
*Tom:* Because I'm also, so I'm thinking long term broad will want the ability to support. wide range of models were one the ability to run local models. All of this managed through the
*Tom:* so it's being able to handle the differences when they do come up.
*Speaker 2:* Makes sense.
*Tom:* It's something up around it. It starts something. I feel the urge for us to trying to get into immediately but it is you know how at the moment how um
*Speaker 2:* them for like codecs from within them to do certain bits.
*Tom:* Yeah, how would that would that currently work if you say I didn't run codecs at all? Would it just not choose to do that because I didn't have the skill or would it do it like fail I think so.
*Tom:* Yeah, it's a great
*Speaker 4:* question.
*Tom:* So it's basically some stuff right now relies on codex delegate.
*Speaker 5:* All right.
*Tom:* But if you don't have codex, what's the full deck?
*Speaker 5:* Yeah.
*Speaker 3:* Yeah.
*Speaker 2:* Well, I'm 100% rely on Claude at the moment, which I think we probably have to for now. Yeah.
*Tom:* I've been looking at, as I say, alternatives. So, so Trying to get my head around agent, agentic harnesses and how they will work. It's been interesting, but I mean it does seem that Pi is the one that people use if they want to roll their own. And it's very good because it supports hot reloading.
*Tom:* But then you basically have to recreate the functionality that you want from the Claude harness. So doable, it's a thing, but that's what you are.
*Chris:* I was gonna say.
*Tom:* What OpenClaw effectively uses is pie as its harness and then it links to Claude and OpenAI. You can choose between a whole bunch of models to actually run within it, which means it is fully neutral. I see that as maybe a ZigZig V3 thing that we might need to look at for sure.

---
*[Transcript extracted from separate source — remainder of meeting below]*
---

*Tom:* I want to show you just something then very quickly. So most of my stuff within it — I do want to do is — I'll have the dashboard as a thing within the whole web, yeah. So I went into this, yeah — like I got all this running at one point but I couldn't get the login to work properly and so yeah, I gave up.

*Chris:* Um, so obviously I'll tweak these because you've changed some of — I don't know how many.

*Tom:* Yeah, I've removed breakdown at the moment, so sorry.

*Chris:* No, I have got breakdown still. You've got breakdown for sure.

*Tom:* Yeah, I do.

*Chris:* The one I don't know whether we really will fully need anymore is 'ready', because stuff seems to flow through it really quickly.

*Tom:* Like, well — I'm gonna say I don't think there is a 'ready' anymore. There's like 'created' which isn't 'ready', right? So we'd never need to see it on the dash, on the actual visual view, because if stuff is created a minute later it would be picked up and put in.

*Chris:* No, not necessarily, right? So you can create a feature without it being broken down. What then triggers the breakdown?

*Tom:* You ask the CPO.

*Chris:* Yeah, right. So why would you ever not advance it straight?

*Tom:* I've done it before because I created a feature that I hadn't defined enough.

*Chris:* Okay, but it's really an idea then, I guess.

*Tom:* Yes, absolutely. So that's the point — all the definition and speccing should happen here in the ideas section. In a way, what that should have been is — it should have been 'proposal'. And then when that is specced... I've got that aspect out at the moment. But instead of it saying 'need spec', it would — because the database is down — it would say 'spec'd'. And then effectively it could be — at the moment it is manually pushed. But one of the things I was thinking last night is I think we could have a system very easily where if something is a proposal and it's been spec'd out and it's not complicated — like it doesn't need — so 'workshop' means it needs a deep dive around it to figure out if it goes anywhere. And if the pipeline's looking healthy and there are slots free, then the CPO should grab stuff and just do it.

*Chris:* Yeah.

*Tom:* Because I actually think we sit there at the moment needing human intervention on those things, and we probably shouldn't.

*Chris:* Cool. 

Tom: I think there could be a little trigger — a little switch where you could turn on to stop auto-pushing.

*Chris:* Yeah, it makes sense.

*Tom:* But yeah, I think that's a good idea. I think a few switches on here might be a good idea as well. So I think there could be sometimes like 'hold everything' — that could be good. Yeah, because I see another automated thing here at the beginning, which is that it should also triage stuff anyway. But then stuff that's being triaged — what it typically does at the moment is it might go, "here's my five recommendations for things that are really simple that we can promote to needing a specification", and then I'll go and do the specification. And again, if those things don't need human intervention, they should just go all the way through, do the spec, and then push on into the pipeline. So we can have switches at all of these gates, but effectively if we can start to use the free capacity — which is at the moment sitting there idle — to take anything that is actually relatively simple to do, or a bug — like I've got a bug here which in theory could just flow through the whole thing automated. We get much closer to having an automated approach.

*Chris:* Cool. Yeah, great.

*Tom:* The other thing I was then thinking — and this is maybe harder — is do we need, like, would it be useful in the future to have a 'simulating' column or something? Or something that when something gets to the end of it and it's integrated, could we actually have a job run where it goes and tries it and tries to simulate it?

*Chris:* But exactly — so that's what I think. That's what this next bit becomes. Like, once we've got this set up, is to try and add in that step, which is this whole thing of stuff actually happening in that flow. Like, on staging it should go and do it. I mean, it could be because it's using an iOS app and it's trying to see whether it works in an iOS app — could be a web thing. But it running what looks like a real user doing stuff through its own product, coming up with problems or bugs or anything else, and then ideally pushing those problems or bugs back through as ideas in the pipeline, which then get auto-pushed all the way through and it can work on fixing them. So then you have effectively some kind of feedback loop that is continuously improving whilst slots are free.

*Tom:* Yeah, I agree. I think that's the secret of all of this — if we can get it that it's testing itself then it will solve everything in a way.

*Chris:* Yeah.

*Tom:* Because I was also thinking that at the last stage it could simulate and go "here's the bugs", but if you also got it to do just a small thing at the end — like "come up with three ideas that you think would improve this" — be quite specific and detailed and focused and small, these are like one-percent ideas not 100% ideas — then it could push that into the ideas inbox at the beginning, triage them to see whether it works against your goals, and if it works against your goals and it thinks it's doable and it's not going to break anything, it would push it through to a proposal and do a spec. So you actually might get some actual compounded improvement, not just bug fixing. I don't know, maybe I'm being too wild there, but I think it could be...

*Chris:* No, I think eventually the whole point is to remove us as much as possible.

*Tom:* Yeah. Well, we're just feeding in occasional ideas rather than all ideas. And this is the way I think our differential comes from everybody else — the more I'm looking at what everybody else is doing, everybody else is almost requiring founders to be micromanaging, whereas I think we want founders to be able to brief their team and give them ideas but not to then have to babysit any of it through. It should feel magical enough that it's just all being handled — it's only surfacing things that are kind of interventions that you need.

*Tom:* I don't know — I think that's not working, is it? Yeah, I just tried to log into Superbase again before. But so this front dashboard bit had an interface for decisions waiting as well. I don't know if I've still got access to the mock-up or whether it's on staging. Let me just see if I've got the mock-up. Oh no, it's gone — it's in my stash. Doesn't matter. But the idea is that it could — a bit like we talked about the other day — this kind of sim idea where it could pop something up and go "I need a decision on this" and it could happen just through the dashboard.

*Chris:* Yeah, that'd be cool.

*Tom:* Yeah. Okay, well, we need to wait for Superbase to...

*Chris:* I can't promote this, but I'm hoping I can just promote it when it all comes back up, and all my changes will be on live and you can start using the live pipeline but knowing it's more stable.

*Tom:* Yeah. Okay. And then what do I... okay, so I log in to — I'll use the production version because you're promoting it?

*Chris:* Yeah, exactly. So nearly all your jobs should be on the production version. Anything to do with Zizig — yeah, you should be using the production version. Anything the way you're testing what you've done would be on the staging version. And probably not — you're probably not working in Zizig on staging. You're probably working in some other company which you'd ask it to do different things — change the colour of this website or...

*Tom:* Okay. Yeah.

*Chris:* I can get into Superbase now. It does say they're investigating a dashboard and management API issue, but it says it's been fully recovered and they're just continuing to monitor.

*Tom:* I still can't log in. Oh — so in the login stuff — where is zazig.com hosted at the moment?

*Chris:* I think it's probably on Vercel.

*Tom:* No, it's not.

*Chris:* Good question, then. What even is it? Oh. "Deployment not found." Oh, so it was on Vercel and it's gone.

*Tom:* Okay. So yeah, there's nothing — it's just getting a 404 now. Okay. I'm happy with using Vercel.

*Chris:* Maybe it's easier just to keep it all in your stuff.

*Tom:* Yeah, it's fine, it's good — it is easy to use. Do you want to give me a login to it in your space and then I'll see if I can — so then I'll move my stuff back into Vercel, and then — cool. And then if we try and link through the domain, then at least if we look at the auth stuff, we can try and make both of them work via zazig.com on Vercel.

*Chris:* I think that's probably the way. Cool.

*Tom:* Yeah. I think if we can get all that working that would be really good.

*Chris:* Yeah. Which is going to require changes to the CLI, won't it?

*Tom:* So yeah. But if we can get it working on the staging version of the CLI, then we'll know it'll work. So I think what we should probably do just as a practice for now is I will avoid promoting. I think we should leave promoting to you so that at least...

*Chris:* Cool, makes sense.

*Tom:* So my changes can be in staging and then until we're at the stage where we're like "okay, it makes no sense for you to be the blocker anymore", or if we've got to automate it in some way.

*Chris:* Yeah. So the only thing I would say is I guess I'm pretty good at doing that because the beauty is I now ask every day what you've pushed to master. So it'll tell me anyway — all the bits.

*Tom:* Yeah. I guess maybe we should create a spreadsheet or something because if you go and check it — so say you've gone and tested it — that bit, it'd be useful to just have somewhere where we've said "yep, we've checked that."

*Chris:* Yeah. I wonder if we can add it into something on the dashboard or something. Feels...

*Tom:* Just tick it or something.

*Chris:* Yeah.

*Tom:* Yeah, that feels like something to add to the dashboard, doesn't it?

*Chris:* Yeah. It'll only be useful if we could take it in the database — when we have it so that when we ask the CPO about what's left to check, it could then go "oh, all these three things have gone to master and haven't been checked", and be like "okay, yeah."

*Tom:* Oh, before then — I can have a look at that if you want. I'll try and just see if I can work out...

*Chris:* Well, you should — you should figure out what needs to go in the database, and I should figure out what needs to go in the pipeline design. Because effectively I'm going to replace the existing pipeline with the new one ASAP anyway.

*Tom:* Cool. So I'm just thinking — what do I now need to do to get the current version up and running?

*Chris:* So in theory it's just going to be — as soon as I promote this — yeah, then you should just be able to pull from master. And then we will have to ask — I don't know exactly what link command I did to link to that distribution, but I'll ask it, and then you'll run that command.

*Tom:* Yeah. And then, yeah, then it should just be working. Yeah. Okay. All right. So we'll do it later.

*Chris:* Yes.

*Tom:* All right. I know the first time I run promote, it's not going to work.

*Chris:* Yeah.

*Tom:* All right. Just keep me posted.

*Chris:* Yeah. Well, Superbase still won't log in for me. So I'll let you know.

*Tom:* All right. Yeah, bye.
