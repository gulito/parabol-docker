import {SubscriptionChannel} from 'parabol-client/types/constEnums'
import getRethink from '../../../database/rethinkDriver'
import getKysely from '../../../postgres/getKysely'
import {getUserId, isTeamMember} from '../../../utils/authorization'
import publish from '../../../utils/publish'
import standardError from '../../../utils/standardError'
import {MutationResolvers} from '../resolverTypes'

const reflectTemplatePromptUpdateGroupColor: MutationResolvers['reflectTemplatePromptUpdateGroupColor'] =
  async (_source, {promptId, groupColor}, {authToken, dataLoader, socketId: mutatorId}) => {
    const r = await getRethink()
    const pg = getKysely()
    const now = new Date()
    const operationId = dataLoader.share()
    const subOptions = {operationId, mutatorId}
    const viewerId = getUserId(authToken)

    const prompt = await dataLoader.get('reflectPrompts').load(promptId)

    // AUTH
    if (!prompt || prompt.removedAt) {
      return standardError(new Error('Prompt not found'), {userId: viewerId})
    }
    if (!isTeamMember(authToken, prompt.teamId)) {
      return standardError(new Error('Team not found'), {userId: viewerId})
    }

    // VALIDATION
    const {teamId} = prompt

    // RESOLUTION
    await Promise.all([
      r
        .table('ReflectPrompt')
        .get(promptId)
        .update({
          groupColor,
          updatedAt: now
        })
        .run(),
      pg.updateTable('ReflectPrompt').set({groupColor}).where('id', '=', promptId).execute()
    ])
    dataLoader.clearAll('reflectPrompts')
    const data = {promptId}
    publish(
      SubscriptionChannel.TEAM,
      teamId,
      'ReflectTemplatePromptUpdateGroupColorPayload',
      data,
      subOptions
    )
    return data
  }

export default reflectTemplatePromptUpdateGroupColor
