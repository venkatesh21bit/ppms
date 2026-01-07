import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function setupWardens() {
  try {
    console.log('Setting up hostel wardens...\n');

    // Check existing wardens
    const existingWardens = await prisma.user.findMany({
      where: { role: 'WARDEN' }
    });

    console.log(`Found ${existingWardens.length} existing warden(s)\n`);

    const wardens = [
      {
        email: 'agasthya.warden@college.edu',
        password: 'warden123',
        name: 'Agasthya Bhavanam Warden'
      },
      {
        email: 'vasishta.warden@college.edu',
        password: 'warden123',
        name: 'Vasishta Bhavanam Warden'
      },
      {
        email: 'gautama.warden@college.edu',
        password: 'warden123',
        name: 'Gautama Bhavanam Warden'
      }
    ];

    for (const warden of wardens) {
      const exists = await prisma.user.findUnique({
        where: { email: warden.email }
      });

      if (exists) {
        console.log(`✓ ${warden.name} already exists`);
        continue;
      }

      const hashedPassword = await bcrypt.hash(warden.password, 12);
      
      await prisma.user.create({
        data: {
          email: warden.email,
          password: hashedPassword,
          name: warden.name,
          role: 'WARDEN'
        }
      });

      console.log(`✓ Created ${warden.name}`);
      console.log(`  Email: ${warden.email}`);
      console.log(`  Password: ${warden.password}\n`);
    }

    console.log('\n✅ All wardens are set up!');

  } catch (error) {
    console.error('Error setting up wardens:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupWardens();
