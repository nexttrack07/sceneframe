import { Film } from 'lucide-react'
import type { Message } from '@/db/schema'
import { parseSceneProposal } from '../lib/script-helpers'

export function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  const sceneProposal = !isUser ? parseSceneProposal(message.content) : null
  const displayText = !isUser
    ? message.content.replace(/```scenes\s*[\s\S]*?```/, '').trim()
    : message.content

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? 'bg-muted' : 'bg-primary/15'
        }`}
      >
        {isUser ? (
          <span className="text-xs font-semibold text-muted-foreground">You</span>
        ) : (
          <Film size={13} className="text-primary" />
        )}
      </div>
      <div className="max-w-[75%] space-y-3">
        {displayText && (
          <div
            className={`rounded-2xl px-4 py-3 ${
              isUser
                ? 'bg-foreground text-background rounded-tr-md'
                : 'bg-muted text-foreground rounded-tl-md'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{displayText}</p>
          </div>
        )}
        {sceneProposal && (
          <div className="space-y-2">
            {sceneProposal.map((scene, i) => (
              <div
                key={`${scene.title}-${scene.description.slice(0, 30)}`}
                className="bg-card border border-primary/30 rounded-lg p-3 shadow-sm"
              >
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
                  Scene {i + 1}
                  {scene.title ? `: ${scene.title}` : ''}
                </p>
                {(scene.beat || scene.durationSec || scene.hookRole) && (
                  <p className="text-[11px] text-muted-foreground mb-1">
                    {[scene.beat ? `Beat: ${scene.beat}` : null, scene.durationSec ? `${scene.durationSec}s` : null, scene.hookRole ? `Role: ${scene.hookRole}` : null]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                )}
                <p className="text-sm text-foreground leading-relaxed">{scene.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
