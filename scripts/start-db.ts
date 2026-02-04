import { DatabaseService } from '../src/main/services/db-script'

// Force development mode for correct path resolution
process.env.NODE_ENV = 'development'

async function main() {
  console.log('Starting DB for migration...')
  try {
    const dbService = DatabaseService.getInstance()
    await dbService.init()
    console.log('Database initialized successfully on port 54320')

    // Keep alive for 5 minutes to allow migration
    console.log('Keeping process alive for 5 minutes...')
    await new Promise(resolve => setTimeout(resolve, 300000))

    await dbService.shutdown()
  } catch (error) {
    console.error('Failed to init DB:', error)
    process.exit(1)
  }
}

main()
