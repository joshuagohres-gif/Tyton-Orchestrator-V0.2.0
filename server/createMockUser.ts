import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const MOCK_USER_ID = "550e8400-e29b-41d4-a716-446655440000"; // Fixed UUID for demo user

async function createMockUser() {
  try {
    // Check if mock user exists
    const existingUser = await db.select().from(users).where(eq(users.id, MOCK_USER_ID)).limit(1);
    
    if (existingUser.length === 0) {
      // Create mock user
      await db.insert(users).values({
        id: MOCK_USER_ID,
        username: 'demo-user',
        email: 'demo@tyton.dev',
        password: 'demo-password-hash'
      });
      console.log(`Mock user created successfully with ID: ${MOCK_USER_ID}`);
    } else {
      console.log('Mock user already exists');
    }
  } catch (error) {
    console.error('Error creating mock user:', error);
    throw error;
  }
}

createMockUser()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });