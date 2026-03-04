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
*Speaker 2:* I was gonna say.
*Tom:* What OpenClaw effectively uses is pie as its harness and then it links to Claude and OpenAI. You can choose between a whole bunch of models to actually run within it, which means it is fully neutral. I see that as maybe a ZZV3 thing that we might need to look at.
*Tom:* I want to show you just something then very quickly. So most of my...