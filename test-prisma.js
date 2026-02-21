const { PrismaClient } = require('./generated/prisma');
const prisma = new PrismaClient();

async function main() {
    console.log('Connecting to Prisma Accelerate database...');
    const usersCount = await prisma.users.count();
    console.log('Successfully connected to new Postgres cloud database via Accelerate URL! Users total:', usersCount);
}

main()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
