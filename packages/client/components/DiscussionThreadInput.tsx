import styled from '@emotion/styled'
import graphql from 'babel-plugin-relay/macro'
import {ContentState, convertToRaw, EditorState} from 'draft-js'
import React, {forwardRef, RefObject, useEffect, useState} from 'react'
import {commitLocalUpdate, createFragmentContainer} from 'react-relay'
import useAtmosphere from '~/hooks/useAtmosphere'
import useMutationProps from '~/hooks/useMutationProps'
import useReplyEditorState from '~/hooks/useReplyEditorState'
import AddCommentMutation from '~/mutations/AddCommentMutation'
import EditCommentingMutation from '~/mutations/EditCommentingMutation'
import {Elevation} from '~/styles/elevation'
import {SORT_STEP} from '~/utils/constants'
import dndNoise from '~/utils/dndNoise'
import convertToTaskContent from '~/utils/draftjs/convertToTaskContent'
import isAndroid from '~/utils/draftjs/isAndroid'
import {DiscussionThreadInput_discussion} from '~/__generated__/DiscussionThreadInput_discussion.graphql'
import {DiscussionThreadInput_viewer} from '~/__generated__/DiscussionThreadInput_viewer.graphql'
import anonymousAvatar from '../styles/theme/images/anonymous-avatar.svg'
import Avatar from './Avatar/Avatar'
import {DiscussionThreadables} from './DiscussionThreadList'
import CommentEditor from './TaskEditor/CommentEditor'
import {ReplyMention, SetReplyMention} from './ThreadedItem'
import {PALETTE} from '../styles/paletteV3'
import CreateTaskMutation from '../mutations/CreateTaskMutation'
import AddTaskButton from './AddTaskButton'
import SendCommentButton from './SendCommentButton'
import {isViewerTypingInTask} from '../utils/viewerTypingUtils'
import {useBeforeUnload} from '../hooks/useBeforeUnload'

const Wrapper = styled('div')<{isReply: boolean; isDisabled: boolean}>(({isDisabled, isReply}) => ({
  display: 'flex',
  flexDirection: 'column',
  borderRadius: isReply ? '4px 0 0 4px' : undefined,
  boxShadow: isReply ? Elevation.Z2 : Elevation.DISCUSSION_INPUT,
  opacity: isDisabled ? 0.5 : undefined,
  marginLeft: isReply ? -12 : undefined,
  marginTop: isReply ? 8 : undefined,
  pointerEvents: isDisabled ? 'none' : undefined,
  // required for the shadow to overlay draft-js in the task cards
  zIndex: 0
}))

const CommentContainer = styled('div')({
  display: 'flex',
  flex: 1,
  padding: 4
})

const CommentAvatar = styled(Avatar)({
  margin: 8,
  transition: 'all 150ms'
})

const EditorWrap = styled('div')({
  flex: 1,
  margin: '14px 0'
})

const TaskContainer = styled('div')({
  display: 'flex',
  borderTop: `1px solid ${PALETTE.SLATE_200}`,
  padding: 6
})

interface Props {
  allowedThreadables: DiscussionThreadables[]
  editorRef: RefObject<HTMLTextAreaElement>
  getMaxSortOrder: () => number
  discussion: DiscussionThreadInput_discussion
  viewer: DiscussionThreadInput_viewer
  onSubmitCommentSuccess?: () => void
  threadParentId?: string
  isReply?: boolean
  isDisabled?: boolean
  setReplyMention?: SetReplyMention
  replyMention?: ReplyMention
  dataCy: string
}

const DiscussionThreadInput = forwardRef((props: Props, ref: any) => {
  const {
    allowedThreadables,
    editorRef,
    getMaxSortOrder,
    discussion,
    onSubmitCommentSuccess,
    threadParentId,
    replyMention,
    setReplyMention,
    dataCy,
    viewer
  } = props
  const {picture} = viewer
  const isReply = !!props.isReply
  const isDisabled = !!props.isDisabled
  const {id: discussionId, meetingId, isAnonymousComment, teamId} = discussion
  const [editorState, setEditorState] = useReplyEditorState(replyMention, setReplyMention)
  const atmosphere = useAtmosphere()
  const {submitting, onError, onCompleted, submitMutation} = useMutationProps()
  const [isCommenting, setIsCommenting] = useState(false)
  const [canCreateTask, setCanCreateTask] = useState(true)
  const placeholder = isAnonymousComment ? 'Comment anonymously' : 'Comment publicly'
  const [lastTypedTimestamp, setLastTypedTimestamp] = useState<Date>()
  const allowTasks = allowedThreadables.includes('task')
  const allowComments = allowedThreadables.includes('comment')

  useBeforeUnload(() => {
    EditCommentingMutation(
      atmosphere,
      {
        isCommenting: false,
        discussionId
      },
      {onError, onCompleted}
    )
  })

  useEffect(() => {
    const inactiveCommenting = setTimeout(() => {
      if (isCommenting) {
        EditCommentingMutation(
          atmosphere,
          {
            isCommenting: false,
            discussionId
          },
          {onError, onCompleted}
        )
        setIsCommenting(false)
      }
    }, 5000)
    return () => {
      clearTimeout(inactiveCommenting)
    }
  }, [lastTypedTimestamp])

  const toggleAnonymous = () => {
    commitLocalUpdate(atmosphere, (store) => {
      const discussion = store
        .getRoot()
        .getLinkedRecord('viewer')
        ?.getLinkedRecord('discussion', {id: discussionId})
      if (!discussion) return
      discussion.setValue(!discussion.getValue('isAnonymousComment'), 'isAnonymousComment')
    })
    editorRef.current?.focus()
  }

  const hasText = editorState.getCurrentContent().hasText()
  const commentSubmitState = hasText ? 'typing' : 'idle'

  const addComment = (rawContent: string) => {
    submitMutation()
    const comment = {
      content: rawContent,
      isAnonymous: isAnonymousComment,
      discussionId,
      threadParentId,
      threadSortOrder: getMaxSortOrder() + SORT_STEP + dndNoise()
    }
    AddCommentMutation(atmosphere, {comment}, {onError, onCompleted})
    // move focus to end is very important! otherwise ghost chars appear
    setEditorState(
      EditorState.moveFocusToEnd(
        EditorState.push(editorState, ContentState.createFromText(''), 'remove-range')
      )
    )
    onSubmitCommentSuccess?.()
  }

  const ensureCommenting = () => {
    const timestamp = new Date()
    setLastTypedTimestamp(timestamp)
    if (isAnonymousComment || isCommenting) return
    EditCommentingMutation(
      atmosphere,
      {
        isCommenting: true,
        discussionId
      },
      {onError, onCompleted}
    )
    setIsCommenting(true)
  }

  const ensureNotCommenting = () => {
    if (isAnonymousComment || !isCommenting) return
    EditCommentingMutation(
      atmosphere,
      {
        isCommenting: false,
        discussionId
      },
      {onError, onCompleted}
    )
    setIsCommenting(false)
  }

  const onSubmit = () => {
    if (submitting) return
    ensureNotCommenting()
    const editorEl = editorRef.current
    if (isAndroid) {
      if (!editorEl || editorEl.type !== 'textarea') return
      const {value} = editorEl
      if (!value) return
      addComment(convertToTaskContent(value))
      return
    }
    const content = editorState.getCurrentContent()
    if (!content.hasText()) return
    addComment(JSON.stringify(convertToRaw(content)))
  }

  const addTask = () => {
    const {viewerId} = atmosphere
    const newTask = {
      status: 'active',
      sortOrder: dndNoise(),
      discussionId,
      meetingId,
      threadParentId,
      threadSortOrder: getMaxSortOrder() + SORT_STEP + dndNoise(),
      userId: viewerId,
      teamId
    } as const
    CreateTaskMutation(atmosphere, {newTask}, {})
  }

  useEffect(() => {
    const focusListener = () => {
      setCanCreateTask(!isViewerTypingInTask())
    }

    document.addEventListener('blur', focusListener, true)
    document.addEventListener('focus', focusListener, true)
    return () => {
      document.removeEventListener('blur', focusListener, true)
      document.removeEventListener('focus', focusListener, true)
    }
  }, [])

  const avatar = isAnonymousComment ? anonymousAvatar : picture
  return (
    <Wrapper data-cy={`${dataCy}-wrapper`} ref={ref} isReply={isReply} isDisabled={isDisabled}>
      <CommentContainer>
        <CommentAvatar size={32} picture={avatar} onClick={toggleAnonymous} />
        <EditorWrap>
          <CommentEditor
            dataCy={`${dataCy}`}
            editorRef={editorRef}
            editorState={editorState}
            ensureCommenting={ensureCommenting}
            onBlur={ensureNotCommenting}
            onSubmit={onSubmit}
            placeholder={placeholder}
            setEditorState={setEditorState}
            teamId={teamId}
            readOnly={!allowComments}
          />
        </EditorWrap>
        <SendCommentButton
          dataCy={`${dataCy}`}
          commentSubmitState={commentSubmitState}
          onSubmit={onSubmit}
        />
      </CommentContainer>
      {allowTasks && (
        <TaskContainer>
          <AddTaskButton dataCy={`${dataCy}-add`} onClick={addTask} disabled={!canCreateTask} />
        </TaskContainer>
      )}
    </Wrapper>
  )
})

export default createFragmentContainer(DiscussionThreadInput, {
  viewer: graphql`
    fragment DiscussionThreadInput_viewer on User {
      picture
    }
  `,
  discussion: graphql`
    fragment DiscussionThreadInput_discussion on Discussion {
      id
      meetingId
      teamId
      isAnonymousComment
    }
  `
})
