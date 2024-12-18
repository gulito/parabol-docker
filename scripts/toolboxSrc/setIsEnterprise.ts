import getKysely from 'parabol-server/postgres/getKysely'
import {defaultTier} from 'parabol-server/utils/defaultTier'
import {Logger} from 'parabol-server/utils/Logger'

export default async function setIsEnterprise() {
  if (defaultTier !== 'enterprise') {
    throw new Error(
      'Environment variable IS_ENTERPRISE is not set to true. Exiting without updating tiers.'
    )
  }

  const pg = getKysely()
  await Promise.all([
    pg.updateTable('Organization').set({tier: 'enterprise'}).execute(),
    pg.updateTable('OrganizationUser').set({tier: 'enterprise'}).execute(),
    pg.updateTable('User').set({tier: 'enterprise'}).execute(),
    pg.updateTable('Team').set({tier: 'enterprise'}).execute()
  ])

  Logger.log('Finished updating tiers.')

  await pg.destroy()
  process.exit()
}

setIsEnterprise()
