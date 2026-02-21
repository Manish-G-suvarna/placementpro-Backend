const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

// We use Prisma's db execute to run raw SQL against the PostgreSQL database
const sqlFile = path.join(__dirname, 'prisma', 'migrations', 'fix_role_enum.sql');
const sql = fs.readFileSync(sqlFile, 'utf8');

// Write a temp file for prisma db execute
const tmpFile = path.join(__dirname, 'prisma', 'migrations', '_tmp_migration.sql');
fs.writeFileSync(tmpFile, sql);

try {
    console.log('🔧 Running role enum migration...');
    execSync(`npx prisma db execute --file ./prisma/migrations/_tmp_migration.sql --schema ./prisma/schema.prisma`, {
        stdio: 'inherit',
        cwd: __dirname,
    });
    console.log('✅ Migration complete');
} catch (err) {
    console.error('❌ Migration failed:', err.message);
} finally {
    fs.unlinkSync(tmpFile);
}
