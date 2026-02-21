const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function seed() {
    // Connect without database first to create it
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        port: process.env.DB_PORT || 3306,
    });

    const DB = process.env.DB_NAME || 'placementpro';

    console.log('🗄️  Creating database...');
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB}\``);
    await conn.query(`USE \`${DB}\``);

    // ── Create Tables ────────────────────────────────────
    console.log('📋 Creating tables...');

    await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('user', 'organizer', 'admin') DEFAULT 'user',
      avatar_url VARCHAR(500),
      bio TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type ENUM('event', 'program', 'internship', 'competition', 'announcement') NOT NULL,
      title VARCHAR(300) NOT NULL,
      description TEXT NOT NULL,
      media_url VARCHAR(500),
      location VARCHAR(200),
      start_date DATE,
      end_date DATE,
      tags VARCHAR(500),
      apply_link VARCHAR(500),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS applications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_app (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

    await conn.query(`
    CREATE TABLE IF NOT EXISTS saved_posts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      post_id INT NOT NULL,
      user_id INT NOT NULL,
      saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_save (post_id, user_id),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

    // ── Clear existing data ──────────────────────────────
    console.log('🧹 Clearing old data...');
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE saved_posts');
    await conn.query('TRUNCATE TABLE applications');
    await conn.query('TRUNCATE TABLE posts');
    await conn.query('TRUNCATE TABLE users');
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');

    // ── Seed Users ───────────────────────────────────────
    console.log('👤 Seeding users...');
    const password = await bcrypt.hash('password123', 10);

    await conn.query(
        `INSERT INTO users (name, email, password_hash, role, avatar_url, bio) VALUES
     ('Tech Club SRMIST', 'techclub@srmist.edu', ?, 'organizer', NULL, 'Official tech club of SRMIST. We organize hackathons, workshops, and tech talks.'),
     ('Career Services', 'careers@srmist.edu', ?, 'organizer', NULL, 'Helping students land their dream internships and jobs since 2010.'),
     ('Manish G', 'manish@student.edu', ?, 'user', NULL, 'Final year CSE student. Passionate about web development and AI.')`,
        [password, password, password]
    );

    // ── Seed Posts ───────────────────────────────────────
    console.log('📝 Seeding posts...');

    await conn.query(`
    INSERT INTO posts (user_id, type, title, description, media_url, location, start_date, end_date, tags, apply_link) VALUES
    (1, 'event', 'HackSRM 5.0 — 36-Hour National Hackathon',
     'Join 500+ developers from across India in a 36-hour coding marathon. Build innovative solutions, win prizes worth ₹5,00,000, and network with industry leaders from Google, Microsoft, and Amazon.\n\nThemes: HealthTech, FinTech, EdTech, Sustainability\n\nIncludes: Meals, swag kits, mentorship sessions, and free cloud credits.',
     NULL, 'TP Building, SRMIST, Kattankulathur', '2026-03-15', '2026-03-16', 'hackathon,coding,free,onsite', 'https://hacksrm.com'),

    (1, 'event', 'AI/ML Workshop — Build Your First Model',
     'A beginner-friendly, hands-on workshop where you''ll build a complete machine learning model from scratch. We''ll cover Python basics, pandas, scikit-learn, and deploy your model using Flask.\n\nNo prior ML experience needed — just bring your laptop!',
     NULL, 'Online (Zoom)', '2026-03-10', '2026-03-10', 'workshop,AI,ML,free,online', 'https://forms.google.com/techclub-mlworkshop'),

    (2, 'internship', 'Summer Internship — Google STEP 2026',
     'Google''s STEP (Student Training in Engineering Program) internship is now open for first and second-year students. Work on real Google products, get mentored by Googlers, and experience life at one of the world''s top tech companies.\n\nStipend: ₹60,000/month\nDuration: 10 weeks (May - July 2026)',
     NULL, 'Bangalore / Hyderabad', '2026-05-01', '2026-07-15', 'internship,google,paid,onsite', 'https://careers.google.com/step'),

    (2, 'internship', 'Microsoft Engage 2026 — Mentorship Program',
     'Microsoft Engage is a 4-week mentorship program for pre-final year students. You''ll work on a guided project with a Microsoft mentor and get a chance to convert to a full-time SDE internship.\n\nOpen to all branches. Strong DSA and development skills preferred.',
     NULL, 'Remote', '2026-06-01', '2026-06-28', 'internship,microsoft,remote,mentorship', 'https://microsoft.com/engage'),

    (1, 'competition', 'CodeChef Campus Challenge — ₹1L Prize Pool',
     'Represent SRMIST in the CodeChef Campus Challenge! A 3-hour competitive programming contest with problems ranging from easy to expert. Top 3 coders from our campus win cash prizes and CodeChef merchandise.\n\nPlatform: CodeChef\nLanguages: C++, Java, Python',
     NULL, 'Online', '2026-03-20', '2026-03-20', 'competition,coding,CP,online', 'https://codechef.com/campus-challenge'),

    (1, 'competition', 'Smart India Hackathon 2026 — Internal Selections',
     'SIH 2026 internal selection rounds are here! Form teams of 6, pick a problem statement from the portal, and submit your prototype. Top teams represent SRMIST at the national finale.\n\nProblem Statements: Available on SIH Portal\nTeam Size: 6 members (at least 1 female member)',
     NULL, 'SRMIST Campus', '2026-04-01', '2026-04-02', 'hackathon,SIH,onsite,team', 'https://sih.gov.in'),

    (2, 'program', 'AWS Cloud Practitioner — Free Certification Program',
     'Get AWS Cloud Practitioner certified for FREE through our campus partnership with Amazon Web Services. The program includes 6 weeks of guided learning, practice exams, and a free exam voucher (worth ₹12,000).\n\nRequirements: Basic IT knowledge\nCommitment: 5 hours/week',
     NULL, 'Online (Self-paced)', '2026-03-01', '2026-04-15', 'certification,AWS,cloud,free,online', 'https://aws.amazon.com/training'),

    (2, 'program', 'Campus to Corporate — Interview Prep Series',
     'A 4-week intensive program covering everything you need to crack product-based company interviews:\n\nWeek 1: DSA Mastery (Arrays, Trees, Graphs)\nWeek 2: System Design Basics\nWeek 3: HR & Behavioral Rounds\nWeek 4: Mock Interviews with Industry Panels\n\nLimited to 100 seats.',
     NULL, 'Seminar Hall, Main Block', '2026-03-05', '2026-03-30', 'placement,interview,free,onsite', NULL),

    (1, 'announcement', 'TCS NQT — Registration Deadline Extended!',
     'Good news! TCS has extended the NQT registration deadline to March 25, 2026. If you haven''t registered yet, do it NOW.\n\nEligibility: 2026 & 2027 passouts, 60%+ throughout\nTest Date: April 5, 2026\nPackage: 3.36 - 7 LPA (based on score)',
     NULL, NULL, NULL, NULL, 'placement,TCS,urgent', 'https://tcs.com/nqt'),

    (2, 'announcement', 'Placement Stats 2025-26 — Record Breaking Year!',
     'SRMIST achieves its best placement season yet!\n\n✅ 95% placement rate\n✅ Highest package: ₹54 LPA (Google)\n✅ Average package: ₹8.2 LPA\n✅ 500+ companies visited\n✅ 3000+ offers made\n\nCongratulations to all placed students! 🎉',
     NULL, NULL, NULL, NULL, 'placement,stats,announcement', NULL),

    (1, 'event', 'Open Source Contribution Day',
     'Spend a day contributing to real open-source projects! Our mentors will guide you through git workflows, finding good first issues, and making your first PR on GitHub.\n\nBring your laptop. All experience levels welcome.\n\nProjects: React, Node.js, Python, Flutter',
     NULL, 'Computer Lab 3, TP Building', '2026-03-22', '2026-03-22', 'opensource,github,free,onsite', 'https://forms.google.com/osd-srm'),

    (2, 'internship', 'Research Internship — IIT Madras (Summer 2026)',
     'IIT Madras is accepting applications for summer research internships in Computer Science. Work under leading professors on cutting-edge research in NLP, Computer Vision, or Systems.\n\nStipend: ₹15,000/month\nDuration: 8 weeks (May - June)\nDeadline: March 30, 2026',
     NULL, 'IIT Madras, Chennai', '2026-05-01', '2026-06-30', 'research,internship,IIT,paid', 'https://iitm.ac.in/summer-research')
  `);

    console.log('✅ Seed complete!');
    console.log('   → 3 users (password: password123)');
    console.log('   → 12 posts across all 5 types');
    console.log('   → Emails: techclub@srmist.edu, careers@srmist.edu, manish@student.edu');

    await conn.end();
    process.exit(0);
}

seed().catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
});
