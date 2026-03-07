import { redirect } from '@tanstack/react-router'
import { auth } from '@clerk/tanstack-react-start/server'
import { db } from '@/db/index'
import { assets, projects, scenes } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

type FailureMode = 'redirect' | 'error'

function fail(mode: FailureMode, message: string): never {
  if (mode === 'redirect') {
    throw redirect({ to: message === 'Unauthenticated' ? '/sign-in' : '/dashboard' })
  }
  throw new Error(message)
}

/**
 * Asserts that the current authenticated user owns the given project.
 * In 'redirect' mode (default), throws redirect() for navigation contexts.
 * In 'error' mode, throws Error for mutation contexts.
 */
export async function assertProjectOwner(
  projectId: string,
  mode: FailureMode = 'redirect',
) {
  const { userId } = await auth()
  if (!userId) fail(mode, 'Unauthenticated')

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId), isNull(projects.deletedAt)),
  })
  if (!project) fail(mode, 'Project not found')

  return { userId, project }
}

/**
 * Asserts that the current authenticated user owns the project the scene
 * belongs to.
 */
export async function assertSceneOwner(
  sceneId: string,
  mode: FailureMode = 'error',
) {
  const { userId } = await auth()
  if (!userId) fail(mode, 'Unauthenticated')

  const scene = await db.query.scenes.findFirst({
    where: and(eq(scenes.id, sceneId), isNull(scenes.deletedAt)),
  })
  if (!scene) fail(mode, 'Scene not found')

  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, scene.projectId),
      eq(projects.userId, userId),
      isNull(projects.deletedAt),
    ),
  })
  if (!project) fail(mode, 'Unauthorized')

  return { userId, scene, project }
}

/**
 * Asserts that the current authenticated user owns the project the asset
 * belongs to (asset → scene → project chain).
 */
export async function assertAssetOwner(
  assetId: string,
  mode: FailureMode = 'error',
) {
  const { userId } = await auth()
  if (!userId) fail(mode, 'Unauthenticated')

  const asset = await db.query.assets.findFirst({
    where: and(eq(assets.id, assetId), isNull(assets.deletedAt)),
  })
  if (!asset) fail(mode, 'Asset not found')

  const scene = await db.query.scenes.findFirst({
    where: and(eq(scenes.id, asset.sceneId), isNull(scenes.deletedAt)),
  })
  if (!scene) fail(mode, 'Scene not found')

  const project = await db.query.projects.findFirst({
    where: and(
      eq(projects.id, scene.projectId),
      eq(projects.userId, userId),
      isNull(projects.deletedAt),
    ),
  })
  if (!project) fail(mode, 'Unauthorized')

  return { userId, asset, scene, project }
}
