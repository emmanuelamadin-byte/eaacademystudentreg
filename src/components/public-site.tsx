"use client";
import Link from "next/link";
import { useState } from "react";
import { motion, MotionConfig } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Palette,
  TrendingUp,
  Menu,
  X,
  Compass,
  Layers,
  Users,
  ShieldCheck,
  WifiOff,
  Video,
  BookOpenCheck,
  Play,
  ChevronDown,
  Star,
  BadgeCheck,
  Quote,
} from "lucide-react";
import { Brand } from "./ui";
import { TRACKS, type CourseModule, type PlatformSettings } from "@/lib/types";
import { useRecords, useRecord } from "@/lib/hooks";
import { useAcademy } from "./academy-provider";
import { CatalogDetails } from "./catalog-data";
import {
  CourseListSchema,
  FaqPageSchema,
} from "./seo-structured-data";

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const { user } = useAcademy();
  const { data: settings } = useRecord<PlatformSettings>("settings", "public");
  return (
    <>
      <header className="public-header">
        <div className="container nav-inner">
          <Brand name={settings?.academyName} />
          <nav
            className={open ? "public-nav open" : "public-nav"}
            aria-label="Main navigation"
          >
            <Link href="/tracks" onClick={() => setOpen(false)}>
              Career tracks
            </Link>
            <Link
              href="/shop"
              scroll={true}
              onClick={() => {
                setOpen(false);
                window.scrollTo({ top: 0, left: 0, behavior: "instant" });
              }}
            >
              Shop
            </Link>
            <Link href="/#approach" onClick={() => setOpen(false)}>
              How it works
            </Link>
            <Link href="/#stories" onClick={() => setOpen(false)}>
              Stories
            </Link>
            <Link href="/#about" onClick={() => setOpen(false)}>
              About
            </Link>
            <Link href="/#faq" onClick={() => setOpen(false)}>
              FAQs
            </Link>
            <Link href="/pricing" onClick={() => setOpen(false)}>
              Membership
            </Link>
            <Link href="/donate" onClick={() => setOpen(false)}>
              Give back <ArrowUpRight size={13} />
            </Link>
            <div className="mobile-nav-actions">
              <Link
                className="btn btn-secondary mobile-nav-btn"
                href={user ? "/app/dashboard" : "/login"}
                onClick={() => setOpen(false)}
              >
                {user ? "My workspace" : "Log in"}
              </Link>
              <Link
                href={user ? "/app/dashboard" : "/signup"}
                className="btn btn-primary mobile-nav-btn"
                onClick={() => setOpen(false)}
              >
                {user ? "Continue learning" : "Start learning"}
                <ArrowUpRight size={15} />
              </Link>
            </div>
          </nav>
          <div className="nav-actions">
            <Link
              className="nav-login"
              href={user ? "/app/dashboard" : "/login"}
            >
              {user ? "My workspace" : "Log in"}
            </Link>
            <Link
              href={user ? "/app/dashboard" : "/signup"}
              className="btn btn-primary btn-small header-cta"
            >
              {user ? "Continue learning" : "Start learning"}
              <ArrowUpRight size={15} />
            </Link>
            <button
              className="icon-btn mobile-menu"
              onClick={() => setOpen(!open)}
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div
          className="public-nav-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
      {settings?.announcement && (
        <div className="public-announcement">{settings.announcement}</div>
      )}
    </>
  );
}
export function PublicFooter() {
  const { data: settings } = useRecord<PlatformSettings>("settings", "public");
  return (
    <footer className="public-footer">
      <div className="container footer-top">
        <div>
          <Brand name={settings?.academyName} />
          <p>
            A place to turn your ambition
            <br />
            into something that matters.
          </p>
        </div>
        <div>
          <span className="eyebrow">YOUR NEXT STEP</span>
          <Link href="/tracks">Explore career tracks</Link>
          <Link
            href="/shop"
            scroll={true}
            onClick={() => {
              window.scrollTo({ top: 0, left: 0, behavior: "instant" });
            }}
          >
            Academy Shop
          </Link>
          <Link href="/pricing">Get Premium</Link>
          <Link href="/donate">Support a scholar</Link>
        </div>
        <div>
          <span className="eyebrow">THE ACADEMY</span>
          <Link href="/#about">About Emmanuel Amadin</Link>
          <Link href="/#approach">Our approach</Link>
          <Link href="/#stories">Student stories</Link>
          <Link href="/login">Student login</Link>
          <Link href="/privacy">Privacy & your data</Link>
          <Link href="/terms">Membership terms</Link>
          {settings?.supportEmail && (
            <a href={`mailto:${settings.supportEmail}`}>Contact the academy</a>
          )}
        </div>
        <div className="footer-note">
          <p>
            Built for ambition.
            <br />
            <strong>Open to possibility.</strong>
          </p>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Emmanuel Amadin Academy</span>
        <span>
          Made for the next generation. <span className="green-dot" />
        </span>
      </div>
    </footer>
  );
}
const icons = [Code2, Palette, TrendingUp];
const gentleEase = [0.16, 1, 0.3, 1] as const;
const heroSequence = {
  hidden: {},
  visible: {
    transition: {
      delayChildren: 0.04,
      staggerChildren: 0.08,
    },
  },
};
const heroItem = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: gentleEase },
  },
};
const revealTransition = { duration: 0.75, ease: gentleEase };
const revealViewport = { once: true, amount: 0.15 } as const;

function TrackArt({ index }: { index: number }) {
  return (
    <div className={`track-art art-${index}`} aria-hidden="true">
      {index === 0 ? (
        <>
          <div className="art-code">
            <span />
            <span />
            <span />
            <b>&lt;/&gt;</b>
            <i>build something meaningful_</i>
          </div>
          <div className="art-orbit" />
        </>
      ) : index === 1 ? (
        <>
          <div className="art-circle" />
          <div className="art-square" />
          <div className="art-cursor">↖</div>
          <span className="art-caption">
            a little perspective changes everything.
          </span>
        </>
      ) : (
        <>
          <div className="art-bars">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <TrendingUp className="art-trend" size={100} strokeWidth={1} />
          <span className="art-caption">a better way forward.</span>
        </>
      )}
    </div>
  );
}
const trackMeta = [
  {
    bg: "#eff6ff",
    iconColor: "#1d4ed8",
    badge: "Code & Automations",
    badgeBg: "#dbeafe",
    badgeColor: "#1e40af",
  },
  {
    bg: "#fff7ed",
    iconColor: "#ea580c",
    badge: "Design & Media",
    badgeBg: "#ffedd5",
    badgeColor: "#9a3412",
  },
  {
    bg: "#f0fdf4",
    iconColor: "#16a34a",
    badge: "Commerce & Growth",
    badgeBg: "#dcfce7",
    badgeColor: "#166534",
  },
];

export function TrackCards() {
  return (
    <div className="track-cards">
      {TRACKS.map((track, index) => {
        const Icon = icons[index];
        const meta = trackMeta[index] || trackMeta[0];
        return (
          <Link
            className="track-card"
            href={`/tracks#${track.id}`}
            key={track.id}
          >
            <div className="track-card-top-bar">
              <span
                className="track-icon"
                style={{ background: meta.bg, color: meta.iconColor }}
              >
                <Icon size={24} />
              </span>
              <span
                className="track-access"
                style={{ background: meta.badgeBg, color: meta.badgeColor }}
              >
                {meta.badge}
              </span>
            </div>

            <div className="track-card-header">
              <span className="track-eyebrow">{track.eyebrow}</span>
              <h3>{track.name}</h3>
              <p>{track.description}</p>
            </div>

            <div className="track-curriculum-box">
              <span className="curriculum-label">Key competencies</span>
              <div className="track-skills">
                {track.skills.map((skill) => (
                  <span key={skill} className="track-skill-chip">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="track-card-bottom">
              <span>Explore curriculum</span>
              <ArrowRight size={16} className="track-arrow" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
function HeroVideoCard() {
  return (
    <motion.div
      className="hero-video-card"
      variants={heroItem}
    >
      <div className="hero-video-player-box">
        <iframe
          className="hero-video-iframe"
          src="https://www.youtube-nocookie.com/embed/7nLBDiFGwt4?autoplay=1&mute=1&loop=1&playlist=7nLBDiFGwt4&rel=0&controls=1"
          title="Welcome to EA Academy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      <div className="hero-video-info">
        <div className="hero-video-progress-meta">
          <strong>Welcome to EA Academy</strong>
          <span>From the founder</span>
        </div>
        <div className="hero-video-progress-bar">
          <div className="hero-video-progress-fill" />
        </div>
        <div className="hero-video-checklist">
          <div className="hero-video-check-item">
            <span className="hero-video-check-box checked">
              <Check size={12} strokeWidth={3} />
            </span>
            <span>Free tracks in AI, media &amp; business</span>
          </div>
          <div className="hero-video-check-item">
            <span className="hero-video-check-box">
              <Play size={10} />
            </span>
            <span>Hands-on assignments &amp; instructor feedback</span>
          </div>
          <div className="hero-video-check-item">
            <span className="hero-video-check-box" />
            <span>Earn verified certificates at zero cost</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function Landing() {
  return (
    <>
      <PublicHeader />
      <MotionConfig reducedMotion="user">
        <main>
          <section className="registration-hero">
            <div className="container hero-layout">
              <motion.div
                className="hero-copy"
                initial="hidden"
                animate="visible"
                variants={heroSequence}
              >
                <motion.span className="registration-pill" variants={heroItem}>
                  <BookOpenCheck size={17} /> FREE ONLINE DIGITAL SKILLS PLATFORM
                </motion.span>
                <motion.h1 variants={heroItem}>
                  Free platform to learn
                  <br />
                  <span className="classroom-accent">online digital skills.</span>
                </motion.h1>
                <motion.p variants={heroItem}>
                  Join structured career tracks in AI &amp; modern digital skills, creative media,
                  and business growth. Attend interactive classes, submit practical assignments,
                  and prove what you can do at zero cost.
                </motion.p>
                <motion.div className="hero-actions" variants={heroItem}>
                  <Link href="/signup" className="btn btn-primary">
                    Register with Google <ArrowUpRight size={19} />
                  </Link>
                  <Link href="/tracks" className="text-link">
                    Find your track <ArrowRight size={17} />
                  </Link>
                </motion.div>
                <motion.div className="hero-reassurance" variants={heroItem}>
                  <span>
                    <Check size={15} /> Google sign-in
                  </span>
                  <span>
                    <Check size={15} /> Practical assignments
                  </span>
                  <span>
                    <Check size={15} /> Instructor feedback
                  </span>
                </motion.div>
              </motion.div>

              <motion.div
                initial="hidden"
                animate="visible"
                variants={heroSequence}
              >
                <HeroVideoCard />
              </motion.div>
            </div>
          </section>
          <motion.section
            className="academy-highlight container"
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={revealViewport}
            transition={revealTransition}
          >
            <div
              className="live-class-visual"
              aria-label="Illustration of a live online academy class"
            >
              <div className="live-class-screen">
                {["EA", "AO", "MI", "KN", "TU", "ZA"].map((initials, index) => (
                  <span
                    key={initials}
                    className={`class-person person-${index}`}
                  >
                    {initials}
                  </span>
                ))}
              </div>
              <div className="live-class-status">
                <Video size={15} /> VIRTUAL CLASSROOM ACTIVE
              </div>
            </div>
            <div className="highlight-copy">
              <span className="eyebrow">
                <BookOpenCheck size={17} /> ACADEMY HIGHLIGHTS
              </span>
              <h2>Learn, build, and submit assignments.</h2>
              <p>
                Follow a clear learning path, join interactive classes, and
                receive useful feedback on the work you submit.
              </p>
              <ul>
                <li>
                  <Check size={17} /> Live classes and guided learning
                </li>
                <li>
                  <Check size={17} /> Mandatory practical assignments
                </li>
                <li>
                  <Check size={17} /> One learning hub for every step
                </li>
              </ul>
              <Link href="/signup" className="btn highlight-button">
                Register to join the academy <ArrowRight size={18} />
              </Link>
            </div>
          </motion.section>
          <motion.section
            className="section container"
            id="tracks"
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={revealViewport}
            transition={revealTransition}
          >
            <div className="section-heading">
              <div>
                <span className="eyebrow">THREE PRACTICAL CAREER TRACKS</span>
                <h2>Choose where you want to grow.</h2>
              </div>
              <p>
                Choose where you want to begin.
                <br />
                We’ll help you build from there.
              </p>
            </div>
            <TrackCards />
          </motion.section>
          <motion.section
            className="approach-section"
            id="approach"
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={revealViewport}
            transition={revealTransition}
          >
            <div className="container approach-grid">
              <div>
                <span className="eyebrow">AN ACADEMY FOR DOERS</span>
                <h2>
                  Don’t just learn it.
                  <br />
                  <span>Put it to work.</span>
                </h2>
                <p>
                  Knowledge becomes opportunity when you use it. Our approach
                  brings structured learning, hands-on practice, and a community
                  into one workspace.
                </p>
                <Link href="/signup" className="btn btn-primary">
                  Take the first step <ArrowUpRight size={18} />
                </Link>
              </div>
              <div className="approach-steps">
                {[
                  {
                    icon: Compass,
                    title: "Choose your direction",
                    text: "Pick a primary track that matches your ambition. Start with the foundations and grow at your pace.",
                  },
                  {
                    icon: Layers,
                    title: "Learn it. Try it. Build it.",
                    text: "Move from lessons to practical exercises and capstone projects. Get feedback that helps you improve.",
                  },
                  {
                    icon: Users,
                    title: "Go further, together",
                    text: "Share your work, ask good questions, and connect with people building their own next chapter.",
                  },
                ].map((step, i) => (
                  <motion.div
                    className="approach-step"
                    key={step.title}
                    initial={{ opacity: 0, x: 18 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, amount: 0.45 }}
                    transition={{
                      duration: 0.68,
                      delay: i * 0.09,
                      ease: gentleEase,
                    }}
                  >
                    <span className="step-icon">
                      <step.icon size={24} />
                    </span>
                    <div>
                      <small>0{i + 1}</small>
                      <h3>{step.title}</h3>
                      <p>{step.text}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.section>
          <StudentStoriesSection />
          <motion.section
            className="section container"
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={revealViewport}
            transition={revealTransition}
          >
            <div className="fellowship-banner">
              <div>
                <span className="eyebrow">
                  A LITTLE INVESTMENT. A LOT OF POSSIBILITY.
                </span>
                <h2>Meet your all-access pass.</h2>
                <p>Every career track. Instructor feedback. Room to grow.</p>
                <Link className="text-link" href="/pricing">
                  Explore Premium <ArrowUpRight size={17} />
                </Link>
              </div>
              <div className="fellowship-price">
                <span>EA ACADEMY PREMIUM</span>
                <strong>
                  ₦3,000<small>/ month</small>
                </strong>
                <Link className="btn btn-primary" href="/signup">
                  Get Premium <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </motion.section>
          <motion.section
            className="impact-section container"
            initial={{ opacity: 0, y: 26 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={revealViewport}
            transition={revealTransition}
          >
            <div className="impact-symbol" aria-hidden="true">
              ↗<span>↗</span>
            </div>
            <div>
              <span className="eyebrow">OPPORTUNITY SHOULD GO FURTHER</span>
              <h2>
                Help someone take
                <br />
                their first step.
              </h2>
              <p>
                Support the scholarship fund and help make learning accessible
                to more ambitious people.
              </p>
              <Link href="/donate" className="text-link">
                Give the gift of opportunity <ArrowUpRight size={18} />
              </Link>
            </div>
          </motion.section>
          <InstructorSpotlightSection />
          <motion.div
            className="platform-strip container"
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={revealViewport}
            transition={revealTransition}
          >
            <span>
              <ShieldCheck size={18} /> Secure account access
            </span>
            <span>
              <WifiOff size={18} /> Keep saved lessons close, even offline
            </span>
            <span>
              <Code2 size={18} /> Built around practice
            </span>
          </motion.div>
          <FaqSection />
        </main>
      </MotionConfig>
      <CourseListSchema />
      <FaqPageSchema faqs={FAQS} />
      <PublicFooter />
    </>
  );
}

export interface StudentStory {
  id: string;
  name: string;
  role: string;
  track: string;
  trackColor: string;
  trackBg: string;
  initials: string;
  avatarBg: string;
  outcome: string;
  quote: string;
  rating: number;
}

export const STUDENT_STORIES: StudentStory[] = [
  {
    id: "nosiru-akindele",
    name: "Nosiru Akindele",
    role: "EA Academy Student",
    track: "Creative Media Studio",
    trackColor: "#ea580c",
    trackBg: "#fff7ed",
    initials: "NA",
    avatarBg: "#ffedd5",
    outcome: "Weekly live sessions & mentorship",
    quote:
      "I have learnt a lot and gained confidence to do more, especially when I get the opportunity to join other tracks of the learning program from EA Academy in the weekly session. How he explains things makes it easy for me to understand, and for some things I don't understand, I make sure I ask and he's always ready to explain it so I can understand it better. And he shares tips on different ways we can go about solving issues we face and he's available to help even at inconvenient times for him. Thank you Mr Emmanuel.",
    rating: 5,
  },
  {
    id: "osawaru-peter",
    name: "Osawaru Peter",
    role: "EA Academy Student",
    track: "Systems & Development",
    trackColor: "#0284c7",
    trackBg: "#f0f9ff",
    initials: "OP",
    avatarBg: "#e0f2fe",
    outcome: "Hands-on weekly teaching",
    quote:
      "Firstly I really want to thank EA Academy for at least finding and creating time to teach us all in the weekly sessions. I've learnt a lot from your teachings and I'm still learning a lot. Thank you sir Emmanuel.",
    rating: 5,
  },
  {
    id: "kaiun",
    name: "Kaiun",
    role: "Digital Marketing Student",
    track: "Business Growth & Wealth",
    trackColor: "#16a34a",
    trackBg: "#f0fdf4",
    initials: "KA",
    avatarBg: "#dcfce7",
    outcome: "Understood 90% of Meta ads",
    quote:
      "I appreciate the efforts you put into your classes. The simple breakdown of Meta ads made me understand 90% of information I was struggling to put together.",
    rating: 5,
  },
];

export function StudentStoriesSection() {
  return (
    <motion.section
      className="section container stories-section"
      id="stories"
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={revealViewport}
      transition={revealTransition}
    >
      <div className="section-heading centered-heading">
        <span className="eyebrow">REAL STUDENT REVIEWS</span>
        <h2>Real feedback. Real skills. Real mentorship.</h2>
        <p>
          Read direct reviews from students learning inside EA Academy about our practical classes,
          weekly live sessions, and hands-on mentorship.
        </p>
      </div>

      <div className="stories-grid">
        {STUDENT_STORIES.map((story, i) => (
          <motion.div
            key={story.id}
            className="story-card"
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{
              duration: 0.6,
              delay: i * 0.1,
              ease: gentleEase,
            }}
          >
            <div className="story-header">
              <div className="story-stars" aria-label={`${story.rating} out of 5 stars`}>
                {Array.from({ length: story.rating }).map((_, idx) => (
                  <Star key={idx} size={15} fill="#f59e0b" color="#f59e0b" />
                ))}
              </div>
              <span className="story-outcome-badge">
                <Check size={12} strokeWidth={2.8} /> {story.outcome}
              </span>
            </div>

            <p className="story-quote">“{story.quote}”</p>

            <div className="story-author">
              <div
                className="story-avatar"
                style={{ backgroundColor: story.avatarBg }}
                aria-hidden="true"
              >
                {story.initials}
              </div>
              <div className="story-author-info">
                <div className="story-author-name">
                  <span>{story.name}</span>
                  <BadgeCheck size={16} className="story-verified-icon" aria-label="Verified graduate" />
                </div>
                <span className="story-author-role">{story.role}</span>
                <span
                  className="story-track-badge"
                  style={{
                    backgroundColor: story.trackBg,
                    color: story.trackColor,
                  }}
                >
                  {story.track}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

export function InstructorSpotlightSection() {
  return (
    <motion.section
      className="section container instructor-section"
      id="about"
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={revealViewport}
      transition={revealTransition}
    >
      <div className="instructor-card">
        <div className="instructor-badge-col">
          <div className="instructor-portrait-card">
            <div className="instructor-avatar-crest" aria-hidden="true">
              <span className="crest-monogram">EA</span>
            </div>
            <div className="instructor-profile-title">
              <h3>Emmanuel Amadin</h3>
              <p className="instructor-role-tag">
                <BadgeCheck size={16} className="verified-badge" /> Founder &amp; Lead Mentor
              </p>
            </div>
            <div className="instructor-pillars">
              <div className="pillar-item">
                <strong>100% Practical Coursework</strong>
                <small>Every lesson requires code or project delivery</small>
              </div>
              <div className="pillar-item">
                <strong>Free Starter Access</strong>
                <small>No card required to begin foundational tracks</small>
              </div>
              <div className="pillar-item">
                <strong>Direct Mentor Feedback</strong>
                <small>Evaluations modeled on professional workplace briefs</small>
              </div>
            </div>
          </div>
        </div>

        <div className="instructor-narrative-col">
          <span className="eyebrow">THE VISION BEHIND EA ACADEMY</span>
          <h2>“Talent is everywhere, but real digital opportunity is not.”</h2>

          <div className="instructor-letter">
            <Quote size={28} className="quote-mark" aria-hidden="true" />
            <p>
              When I founded EA Academy, I had one clear conviction: high-income digital skills
              should never be locked behind expensive bootcamps or inaccessible tuition barriers.
            </p>
            <p>
              The modern global economy rewards those who can actually build reliable web systems,
              craft compelling visual identities, and grow digital businesses—not those who merely
              watch passive videos without ever shipping a production app or finishing a real client brief.
            </p>
            <p>
              We structured every track around practical assignments, instructor code reviews, and
              verifiable credentials. If you are ready to show up and put in the work, you have a home here.
            </p>
          </div>

          <div className="instructor-signature-block">
            <div className="signature-info">
              <div className="signature-script">Emmanuel Amadin</div>
              <span className="signature-title">Academic Director &amp; Founder, EA Academy</span>
            </div>
            <Link href="/signup" className="btn btn-primary instructor-cta">
              Start learning free <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </motion.section>
  );
}

const FAQS = [
  {
    question: "Is EA Academy really a free platform to learn online digital skills?",
    answer:
      "Yes. EA Academy offers free starter access across all career tracks. You can register with your Google account, study foundational modules, complete hands-on assignments, and join student discussions at zero cost.",
  },
  {
    question: "What online digital skills can I learn for free?",
    answer:
      "You can master three high-income digital disciplines: Systems & Automation (practical AI tools, automated workflows, modern websites, and database foundations), Creative Media Studio (visual storytelling, AI video production, and digital design), and Business Growth & Wealth (digital marketing, business management, and modern commerce).",
  },
  {
    question: "Do I get a certificate or verifiable proof of learning?",
    answer:
      "Yes. As you finish courses and submit practical assignments, your achievements are recorded on an official digital transcript with a verifiable verification link you can present to employers, clients, or on your LinkedIn profile.",
  },
  {
    question: "Can I learn on both mobile and PC?",
    answer:
      "Yes. EA Academy is 100% responsive and tested on smartphones, tablets, laptops, and desktop computers. You can also install the EA Academy Progressive Web App (PWA) to access lessons offline anytime.",
  },
  {
    question: "How do the practical assignments and instructor reviews work?",
    answer:
      "Rather than passive videos alone, each module includes practical assignments modeling real-world workplace briefs. You build projects, submit them directly in your student workspace, and receive feedback from instructors.",
  },
  {
    question: "What is the difference between Free and Premium membership?",
    answer:
      "Free membership gives you access to foundational modules, starter assignments, and community lounge forums. Premium (₦3,000/month) unlocks full simultaneous access to all three career tracks, 1-on-1 instructor assignment reviews, live group mentor sessions, and expanded AI tutor assistance.",
  },
];

function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="section container faq-section" id="faq">
      <div className="section-heading centered-heading">
        <span className="eyebrow">FREQUENTLY ASKED QUESTIONS</span>
        <h2>Everything you need to know about learning free.</h2>
        <p>
          Clear answers about our free online curriculum, practical assignments, career tracks, and certificates.
        </p>
      </div>

      <div className="faq-accordion">
        {FAQS.map((faq, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={faq.question}
              className={`faq-item ${isOpen ? "open" : ""}`}
            >
              <button
                type="button"
                className="faq-question"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
              >
                <span>{faq.question}</span>
                <span className="faq-toggle-icon">
                  <ChevronDown size={18} />
                </span>
              </button>
              {isOpen && (
                <div className="faq-answer">
                  <p>{faq.answer}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
export function TracksPage() {
  const { data: modules, error } = useRecords<CourseModule>("modules", [
    ["published", "==", true],
  ]);
  return (
    <>
      <PublicHeader />
      <main className="container section">
        <div className="page-intro">
          <span className="eyebrow">CHOOSE YOUR DIRECTION</span>
          <h1>
            One next step.
            <br />A world of possibility.
          </h1>
          <p>
            Three paths into technology, creativity, and business. Choose your
            primary track at signup. Premium opens the door to all three.
          </p>
        </div>
        {error && (
          <p className="alert">
            The published curriculum is temporarily unavailable. Please try
            again shortly.
          </p>
        )}
        <div className="track-detail-list">
          {TRACKS.map((track, i) => (
            <section className="track-detail" id={track.id} key={track.id}>
              <TrackArt index={i} />
              <div>
                <span className="eyebrow">
                  0{i + 1} / {track.eyebrow}
                </span>
                <h2>{track.name}</h2>
                <p>{track.description}</p>
                <div className="track-skills">
                  {track.skills.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </div>
                <CatalogDetails track={track.id} />
                <h4>Inside the curriculum</h4>
                {modules.filter((m) => m.classId === track.id).length ? (
                  <ol className="curriculum-preview">
                    {modules
                      .filter((m) => m.classId === track.id)
                      .sort((a, b) => a.order - b.order)
                      .map((m) => (
                        <li key={m.id}>
                          <span>{m.title}</span>
                          <span className="badge">
                            {m.free ? "Free" : "Premium"}
                          </span>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p className="muted">
                    The curriculum is being prepared. Published modules and
                    lessons will appear here.
                  </p>
                )}
                <Link
                  href={`/signup?track=${track.id}`}
                  className="btn btn-primary"
                >
                  Choose this track <ArrowUpRight size={17} />
                </Link>
              </div>
            </section>
          ))}
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
