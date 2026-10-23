// SPDX-License-Identifier: Apache-2.0
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { resolveMediaUrl } from "./api";
import {
  IMAGE_LIGHTBOX_LABEL,
  lightboxLabel,
  type ImageLightboxTarget,
} from "./imageLightbox";
import {
  imageFallbackLabel,
  imageRenderPlan,
  imageSourceKind,
} from "./markdownImage";
import type { Session } from "./types";

export type MarkdownMedia = {
  session: Session | null;
  onOpenImage: (target: ImageLightboxTarget, trigger: HTMLElement) => void;
};

const MarkdownMediaContext = createContext<MarkdownMedia>({
  session: null,
  onOpenImage: () => {},
});

const InMarkdownLinkContext = createContext(false);

export function MarkdownMediaProvider({
  value,
  children,
}: {
  value: MarkdownMedia;
  children: ReactNode;
}) {
  return (
    <MarkdownMediaContext.Provider value={value}>{children}</MarkdownMediaContext.Provider>
  );
}

export function useMarkdownMedia(): MarkdownMedia {
  return useContext(MarkdownMediaContext);
}

/** An image inside a link follows the link, not the lightbox. */
export function InMarkdownLink({ children }: { children?: ReactNode }) {
  return <InMarkdownLinkContext.Provider value={true}>{children}</InMarkdownLinkContext.Provider>;
}

type Phase = "loading" | "ready" | "error";

/**
 * Inline image for a completed assistant reply. Remote http(s)
 * loads in the browser. A local attachment path uses the same
 * authenticated fetch as bubble attachments. No new HTTP route.
 */
export function MarkdownInlineImage({
  src,
  alt,
  title,
}: {
  src: string;
  alt: string;
  title: string;
}) {
  const kind = imageSourceKind(src);
  const media = useMarkdownMedia();
  const inLink = useContext(InMarkdownLinkContext);
  const [phase, setPhase] = useState<Phase>("loading");
  const [displaySrc, setDisplaySrc] = useState(kind === "remote" ? src : "");

  useEffect(() => {
    if (kind !== "attachment") return;
    const session = media.session;
    if (!session) {
      setPhase("error");
      return;
    }
    const resolved = resolveMediaUrl(session.baseUrl, src);
    let dead = false;
    let objectUrl = "";
    fetch(resolved, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((response) => (response.ok ? response.blob() : Promise.reject(new Error("load"))))
      .then((blob) => {
        if (dead) return;
        objectUrl = URL.createObjectURL(blob);
        setDisplaySrc(objectUrl);
      })
      .catch(() => {
        if (!dead) setPhase("error");
      });
    return () => {
      dead = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [kind, media.session, src]);

  if (kind === "literal") return null;
  if (phase === "error") {
    return <span className="md-image-fallback">{imageFallbackLabel(alt, src)}</span>;
  }

  const label = alt.trim() || IMAGE_LIGHTBOX_LABEL;
  const tip = title.replace(/\s+/g, " ").trim();
  const picture = (
    <span className="md-image">
      {phase === "loading" ? <span className="md-image-pending" aria-hidden="true" /> : null}
      {displaySrc ? (
        <img
          className="md-inline-image"
          data-state={phase === "ready" ? "ready" : "loading"}
          src={displaySrc}
          alt={inLink ? alt : ""}
          title={tip || undefined}
          draggable={false}
          onLoad={() => setPhase("ready")}
          onError={() => setPhase("error")}
        />
      ) : null}
    </span>
  );

  if (inLink) return picture;

  const openUrl =
    kind === "attachment" && media.session
      ? resolveMediaUrl(media.session.baseUrl, src)
      : src;
  return (
    <button
      type="button"
      className="md-image-btn"
      aria-label={label}
      title={tip || undefined}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        media.onOpenImage(
          { id: `md:${src}`, url: openUrl, name: lightboxLabel(alt) },
          event.currentTarget,
        );
      }}
    >
      {picture}
    </button>
  );
}

export function markdownImageNode(
  completed: boolean,
  alt: string,
  src: string,
  title: string,
): ReactNode {
  const plan = imageRenderPlan(completed, alt, src, title);
  if (plan.type === "hidden") return null;
  if (plan.type === "alt" || plan.type === "literal") return <span>{plan.text}</span>;
  return <MarkdownInlineImage src={plan.src} alt={plan.alt} title={plan.title} />;
}
