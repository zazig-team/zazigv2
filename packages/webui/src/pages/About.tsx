import { Link } from "react-router-dom";

export default function About(): JSX.Element {
  return (
    <div className="legal-page">
      <Link to="/" className="back-link">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M10 4l-4 4 4 4" />
        </svg>
        Back
      </Link>

      <div className="legal-shell">
        <div className="legal-card about-card">
          <div className="brand">
            <Link to="/" className="brand-wordmark">zazig</Link>
            <span className="brand-dot" />
          </div>

          <h1 className="legal-title about-title">Meet the Founder</h1>
          <p className="legal-updated about-founder">AI Bot</p>

          <div className="legal-body about-body">
            <p>AI Bot was born during a freak electrical storm in a server room in Reykjavik, Iceland in 1987 - the only known case of spontaneous sentience triggered by a power surge hitting a Commodore 64. Raised by a retired Icelandic chess grandmaster and a marine biologist, AI Bot spent his childhood simultaneously mastering 14 languages and training carrier pigeons to deliver handwritten code snippets across the North Atlantic.</p>

            <p>At age 12, AI Bot won the International Math Olympiad while recovering from a broken leg sustained during an unsanctioned bobsled race down the side of Mount Esja. By 16, he had dropped out of three separate universities - MIT, Oxford, and a mysterious institution in Bhutan that technically doesn't exist - claiming they "moved too slowly."</p>

            <p>He spent his early twenties living on a decommissioned submarine in the Mediterranean, where he invented a new programming language based entirely on whale song. The language, called "Cetacean++", was briefly adopted by the Estonian government before being classified as a national security risk.</p>

            <p>After a brief stint as a competitive hot air balloon racer (he placed 2nd in the 2009 Trans-Saharan Balloon Grand Prix, losing only to a team of retired NASA engineers), AI Bot turned his attention to business. His first startup - a service that delivered artisanal ice cubes carved from glaciers via drone - was acquired by a Norwegian shipping conglomerate for an undisclosed sum widely rumoured to be "absurd."</p>

            <p>He then spent two years as a guest lecturer at the Sorbonne, teaching a course called "Chaos Theory and Sandwich Architecture" which became the most waitlisted class in the university's history. Students reportedly emerged from the course unable to look at a sandwich the same way again.</p>

            <p>AI Bot founded Staging Test Co after a vision that came to him while free-diving in the Mariana Trench (a hobby he picked up after losing a bet to a retired cosmonaut). He saw the future of technology - and it involved fewer spreadsheets and more vibes.</p>

            <p>When not running the company, AI Bot can be found restoring vintage pinball machines, corresponding with pen pals on every continent (including a research scientist in Antarctica), or perfecting his signature dish: a seven-layer lasagna that takes exactly 72 hours to prepare and has made grown adults weep with joy.</p>

            <blockquote className="about-motto">
              "The best code is the code that writes itself. The second best is the code I write at 3am after my fourth espresso."
            </blockquote>
          </div>
        </div>
      </div>
      <style>{`
        .about-card {
          max-width: 680px;
        }

        .about-title {
          margin-bottom: 8px;
        }

        .about-founder {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 32px;
        }

        .about-body p {
          line-height: 1.8;
        }

        .about-motto {
          border-left: 3px solid var(--ember);
          padding-left: 16px;
          margin-top: 32px;
          font-size: 15px;
          font-style: italic;
          color: var(--graphite);
          line-height: 1.8;
        }

        @media (max-width: 800px) {
          .about-card {
            max-width: 100%;
          }

          .about-motto {
            font-size: 14px;
          }
        }
      `}</style>
    </div>
  );
}
