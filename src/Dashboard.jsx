import React, { useMemo, useState, useEffect, useCallback, useRef } from "react"
import { createPortal } from "react-dom"
import { motion as Motion, AnimatePresence } from "motion/react"
import { api } from "./api"
import { useAuth, signIn, signOut, getToken } from "./auth"
import { MapPanel, UpcomingPanel } from "./MainDashboard"
import { useAllOpportunities } from "./useAllOpportunities"
import "./volunteeringWebsite.css"

const CADENCES = [
  { id: "all", label: "Any time" },
  { id: "weekly", label: "Weekly" },
  { id: "one-off", label: "One-off" },
]

const CATEGORY_FILTER_TONES = {
  external: "var(--brick-red)",
  social: "var(--baby-pink)",
  group: "var(--lavender-purple)",
  individual: "var(--golden-pollen)",
}

const TAB_HASHES = {
  map: "#/map",
  upcoming: "#/upcoming",
  directory: "#/directory",
}

const LEDES = {
  map: "See where opportunities are across London — tap a pin to see what's there.",
  upcoming: "Deadlines closing soon and the latest opportunities.",
  directory: "Filter by cadence and volunteering type, search by name or organisation.",
}

function useCommitteeStatus(user) {
  // null = unknown/loading, true/false = resolved
  const [status, setStatus] = useState(null)
  useEffect(() => {
    if (!user) { setStatus(false); return }
    const token = getToken()
    if (!token) { setStatus(false); return }
    setStatus(null)
    let cancelled = false
    api.getRibbons()
      .then(() => { if (!cancelled) setStatus(true) })
      .catch(() => { if (!cancelled) setStatus(false) })
    return () => { cancelled = true }
  }, [user])
  return status
}

const ALL_CAUSES = [
  "education", "environment", "health", "community", "arts", "sport",
  "refugees", "elderly", "food", "housing", "animals", "disability",
  "mental_health", "poverty", "youth",
]

const CATEGORY_OPTIONS = [
  { id: "social", label: "Social" },
  { id: "group", label: "Group" },
  { id: "individual", label: "Individual" },
  { id: "external", label: "External" },
]

function getOpportunityCategories(opp) {
  if (Array.isArray(opp.categories) && opp.categories.length > 0) return opp.categories
  if (opp.category) return [opp.category]
  return ["external"]
}

function getPrimaryCategory(opp) {
  return getOpportunityCategories(opp)[0] || "external"
}

function getCategoryToneBar(opp) {
  const cats = getOpportunityCategories(opp)
  if (cats.length <= 1) return undefined
  const tones = cats
    .map((id) => CATEGORY_FILTER_TONES[id])
    .filter(Boolean)
  if (tones.length <= 1) return undefined
  const slice = 100 / tones.length
  const stops = tones
    .map((tone, idx) => `${tone} ${idx * slice}% ${(idx + 1) * slice}%`)
    .join(", ")
  return `linear-gradient(90deg, ${stops})`
}

function toDateInput(value) {
  if (!value) return ""
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ""
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function emptyDraft() {
  return {
    id: null,
    title: "",
    organisation: "",
    location: "",
    description: "",
    commitmentType: "",
    experienceNeeded: "",
    experienceYouCanGet: "",
    sourceUrl: "",
    categories: ["social"],
    causes: [],
    setDate: toDateInput(new Date()),
    expiryDate: "",
  }
}

function OpportunityForm({ draft, onChange, onSubmit, onCancel, submitting, msg }) {
  function set(k, v) { onChange({ ...draft, [k]: v }) }
  function toggleCategory(categoryId) {
    const has = draft.categories.includes(categoryId)
    if (has && draft.categories.length === 1) return
    set("categories", has
      ? draft.categories.filter((id) => id !== categoryId)
      : [...draft.categories, categoryId]
    )
  }
  function toggleCause(c) {
    const has = draft.causes.includes(c)
    set("causes", has ? draft.causes.filter((x) => x !== c) : [...draft.causes, c])
  }
  return (
    <form className="uvs-dash-form" onSubmit={onSubmit}>
      <div className="uvs-field">
        <label className="uvs-label">Title</label>
        <input
          className="uvs-input"
          required
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="e.g. Food Bank Volunteer"
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="uvs-field">
          <label className="uvs-label">Organisation</label>
          <input className="uvs-input" value={draft.organisation} onChange={(e) => set("organisation", e.target.value)} />
        </div>
        <div className="uvs-field">
          <label className="uvs-label">Location</label>
          <input className="uvs-input" value={draft.location} onChange={(e) => set("location", e.target.value)} />
        </div>
      </div>
      <div className="uvs-field">
        <label className="uvs-label">Description</label>
        <textarea
          className="uvs-input"
          style={{ minHeight: 72, resize: "vertical", fontFamily: "inherit" }}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="uvs-field">
          <label className="uvs-label">Commitment</label>
          <input className="uvs-input" placeholder="e.g. Weekly, One-off" value={draft.commitmentType} onChange={(e) => set("commitmentType", e.target.value)} />
        </div>
        <div className="uvs-field">
          <label className="uvs-label">Website URL</label>
          <input className="uvs-input" type="url" value={draft.sourceUrl} onChange={(e) => set("sourceUrl", e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="uvs-field">
          <label className="uvs-label">Publish date</label>
          <input
            className="uvs-input"
            type="date"
            value={draft.setDate}
            onChange={(e) => set("setDate", e.target.value)}
          />
          <span className="uvs-field-hint">Used to order opportunities (newest first).</span>
        </div>
        <div className="uvs-field">
          <label className="uvs-label">Expiry date</label>
          <input
            className="uvs-input"
            type="date"
            value={draft.expiryDate}
            onChange={(e) => set("expiryDate", e.target.value)}
          />
          <span className="uvs-field-hint">Optional — opportunity is hidden after this date.</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <div className="uvs-field">
          <label className="uvs-label">Experience needed</label>
          <input
            className="uvs-input"
            value={draft.experienceNeeded}
            onChange={(e) => set("experienceNeeded", e.target.value)}
            placeholder="e.g. None, customer service"
          />
        </div>
        <div className="uvs-field">
          <label className="uvs-label">Experience you can get</label>
          <input
            className="uvs-input"
            value={draft.experienceYouCanGet}
            onChange={(e) => set("experienceYouCanGet", e.target.value)}
            placeholder="e.g. Teamwork, event operations"
          />
        </div>
      </div>
      <div className="uvs-field">
        <label className="uvs-label">Categories</label>
        <div className="uvs-radio-group">
          {CATEGORY_OPTIONS.map((c) => (
            <label
              key={c.id}
              className={`uvs-radio-item uvs-cat-radio uvs-cat-radio--${c.id}${draft.categories.includes(c.id) ? " uvs-radio-item--active" : ""}`}
            >
              <input
                type="checkbox"
                name="categories"
                value={c.id}
                checked={draft.categories.includes(c.id)}
                onChange={() => toggleCategory(c.id)}
              />
              {c.label}
            </label>
          ))}
        </div>
      </div>
      <div className="uvs-field">
        <label className="uvs-label">Causes</label>
        <div className="uvs-cause-grid">
          {ALL_CAUSES.map((cause) => (
            <label
              key={cause}
              className={`uvs-cause-chip${draft.causes.includes(cause) ? " uvs-cause-chip--active" : ""}`}
            >
              <input type="checkbox" checked={draft.causes.includes(cause)} onChange={() => toggleCause(cause)} />
              {cause.replace(/_/g, " ")}
            </label>
          ))}
        </div>
      </div>
      {msg && <p className={msg.ok ? "uvs-success" : "uvs-error-msg"}>{msg.text}</p>}
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button className="uvs-cta uvs-cta-primary" type="submit" disabled={submitting || !draft.title.trim()}>
          {submitting ? "Saving…" : draft.id ? "Save changes" : "Create opportunity"}
        </button>
        <button type="button" className="uvs-cta uvs-cta-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function OpportunityCard({
  opp,
  onToggle,
  isCommittee,
  onEdit,
  starred,
  onStar,
  isFocused,
  onFocusCard,
  onBlurCard,
}) {
  const toneBar = getCategoryToneBar(opp)
  return (
    <Motion.article
      layout
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.18 } }}
      transition={{ duration: 0.26, ease: [0.22, 0.9, 0.32, 1] }}
      className={`uvs-card uvs-card--${getPrimaryCategory(opp)}${isFocused ? " is-focused" : ""}`}
      style={toneBar ? { "--tone-bar": toneBar } : undefined}
      onFocusCapture={onFocusCard}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) onBlurCard()
      }}
    >
      <button
        type="button"
        className="uvs-card-summary"
        onClick={onToggle}
        aria-haspopup="dialog"
      >
        <h3 className="uvs-card-title">{opp.title}</h3>
        <span className="uvs-card-org">
          {opp.organisation && <span className="uvs-card-org-name">{opp.organisation}</span>}
        </span>
      </button>

      <div className="uvs-card-actions">
        <button
          className={`uvs-star-btn${starred ? " uvs-star-btn--active" : ""}`}
          onClick={(e) => { e.stopPropagation(); onStar() }}
          title={starred ? "Remove from starred" : "Star this opportunity"}
          aria-pressed={starred}
        >
          {starred ? "★" : "☆"}
        </button>
        {isCommittee && (
          <button
            type="button"
            className="uvs-card-edit"
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            title="Edit opportunity"
            aria-label="Edit opportunity"
          >
            ✎
          </button>
        )}
      </div>
    </Motion.article>
  )
}

function OpportunityModal({
  opp,
  onClose,
  isCommittee,
  onEdit,
  starred,
  onStar,
  isEditing,
  draft,
  onDraftChange,
  onSubmitEdit,
  onCancelEdit,
  submitting,
  formMsg,
}) {
  const isInternal = !opp.sourceUrl || opp.sourceUrl.startsWith("internal://")
  const modalRef = useRef(null)
  const backdropPressRef = useRef(false)

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const raf = window.requestAnimationFrame(() => {
      modalRef.current?.focus()
    })
    function onKey(e) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => {
      window.cancelAnimationFrame(raf)
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [onClose])

  return createPortal(
    <Motion.div
      className="uvs-modal-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onPointerDown={(e) => {
        backdropPressRef.current = e.target === e.currentTarget
      }}
      onPointerUp={(e) => {
        if (backdropPressRef.current && e.target === e.currentTarget) onClose()
        backdropPressRef.current = false
      }}
      onPointerCancel={() => {
        backdropPressRef.current = false
      }}
    >
      <Motion.div
        className={`uvs-modal uvs-card--${getPrimaryCategory(opp)}`}
        ref={modalRef}
        tabIndex={-1}
        style={(() => {
          const tb = getCategoryToneBar(opp)
          return tb ? { "--tone-bar": tb } : undefined
        })()}
        initial={{ opacity: 0, scale: 0.9, y: 28 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 28 }}
        transition={{ duration: 0.24, ease: [0.22, 0.9, 0.32, 1] }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={opp.title}
      >
        <div className="uvs-modal-head">
          <div className="uvs-modal-head-copy">
            {isEditing ? (
              <>
                <p className="uvs-modal-eyebrow">Editing</p>
                <h2 className="uvs-modal-title uvs-modal-title--edit">Edit opportunity</h2>
              </>
            ) : (
              <>
                <h2 className="uvs-modal-title">{opp.title}</h2>
                {opp.organisation && (
                  <span className="uvs-card-org">
                    <span className="uvs-card-org-name">{opp.organisation}</span>
                  </span>
                )}
              </>
            )}
          </div>
          {!isEditing && (
            <div className="uvs-modal-actions">
              <button
                className={`uvs-star-btn${starred ? " uvs-star-btn--active" : ""}`}
                onClick={onStar}
                title={starred ? "Remove from starred" : "Star this opportunity"}
                aria-pressed={starred}
              >
                {starred ? "★" : "☆"}
              </button>
              {isCommittee && (
                <button
                  type="button"
                  className="uvs-card-edit uvs-modal-edit"
                  onClick={onEdit}
                  title="Edit opportunity"
                  aria-label="Edit opportunity"
                >
                  ✎
                </button>
              )}
            </div>
          )}
        </div>

        {isEditing ? (
          <div className="uvs-modal-edit-panel">
            <OpportunityForm
              draft={draft}
              onChange={onDraftChange}
              onSubmit={onSubmitEdit}
              onCancel={onCancelEdit}
              submitting={submitting}
              msg={formMsg}
            />
          </div>
        ) : (
          <>
            {opp.imageUrl && <img className="uvs-modal-img" src={opp.imageUrl} alt="" />}
            {opp.description && <p className="uvs-card-blurb">{opp.description}</p>}

            <dl className="uvs-card-meta">
              {opp.commitmentType && <div><dt>When</dt><dd>{opp.commitmentType}</dd></div>}
              {opp.location && <div><dt>Where</dt><dd>{opp.location}</dd></div>}
              {opp.experienceNeeded && <div><dt>Experience needed</dt><dd>{opp.experienceNeeded}</dd></div>}
              {opp.experienceYouCanGet && <div><dt>Experience you can get</dt><dd>{opp.experienceYouCanGet}</dd></div>}
              {opp.causes && opp.causes.length > 0 && (
                <div><dt>Causes</dt><dd>{opp.causes.map((c) => c.replace(/_/g, " ")).join(", ")}</dd></div>
              )}
            </dl>

            {(isCommittee || !isInternal) && (
              <div className="uvs-modal-footer">
                {isCommittee && (
                  <button
                    type="button"
                    className="uvs-cta uvs-cta-ghost uvs-modal-edit-cta"
                    onClick={onEdit}
                    aria-label="Edit opportunity"
                  >
                    <span aria-hidden="true">✎</span> Edit
                  </button>
                )}
                {!isInternal && (
                  <a
                    className="uvs-cta uvs-cta-primary uvs-card-link"
                    href={opp.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Learn more →
                  </a>
                )}
              </div>
            )}
          </>
        )}
      </Motion.div>
    </Motion.div>,
    document.body
  )
}

function OpportunitiesPanel({ isCommittee }) {
  const { user } = useAuth()
  const [query, setQuery] = useState("")
  const [causeFilter] = useState("all")
  const [cadenceFilter, setCadenceFilter] = useState("all")
  const [typeFilters, setTypeFilters] = useState([])
  const [needsExperienceFilter, setNeedsExperienceFilter] = useState(false)
  const [experienceGainFilter, setExperienceGainFilter] = useState(false)
  const [opportunities, setOpportunities] = useState([])
  const [starredIds, setStarredIds] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [error, setError] = useState(null)
  const [selectedOpp, setSelectedOpp] = useState(null)
  const [focusedOppId, setFocusedOppId] = useState(null)
  const [editing, setEditing] = useState(null) // null | "new" | <opp.id>
  const [draft, setDraft] = useState(emptyDraft())
  const [submitting, setSubmitting] = useState(false)
  const [formMsg, setFormMsg] = useState(null)
  const sentinelRef = useRef(null)

  const load = useCallback(() => {
    setLoading(true)
    setPage(1)
    setHasMore(false)
    const params = {}
    if (query) params.search = query
    if (causeFilter !== "all") params.causes = causeFilter

    api.getOpportunities(params)
      .then((d) => {
        setOpportunities(d.opportunities || [])
        const starred = new Set(
          (d.opportunities || []).filter((o) => o.starred).map((o) => o.id)
        )
        setStarredIds(starred)
        setHasMore(1 < (d.totalPages || 1))
        setError(null)
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [query, causeFilter])

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, query])

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore || loading) return
    setLoadingMore(true)
    const nextPage = page + 1
    const params = { page: nextPage }
    if (query) params.search = query
    if (causeFilter !== "all") params.causes = causeFilter

    api.getOpportunities(params)
      .then((d) => {
        const incoming = d.opportunities || []
        setOpportunities((prev) => {
          const seen = new Set(prev.map((o) => o.id))
          return [...prev, ...incoming.filter((o) => !seen.has(o.id))]
        })
        setStarredIds((prev) => {
          const next = new Set(prev)
          for (const o of incoming) if (o.starred) next.add(o.id)
          return next
        })
        setPage(nextPage)
        setHasMore(nextPage < (d.totalPages || 1))
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false))
  }, [loadingMore, hasMore, loading, page, query, causeFilter])

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel || !hasMore) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '400px' }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  function toggleTypeFilter(typeId) {
    setTypeFilters((prev) =>
      prev.includes(typeId)
        ? prev.filter((id) => id !== typeId)
        : [...prev, typeId]
    )
  }

  const matched = useMemo(() => {
    return opportunities.filter((opp) => {
      if (cadenceFilter !== "all" && opp.commitmentType?.toLowerCase() !== cadenceFilter) return false
      if (typeFilters.length > 0) {
        const oppCategories = getOpportunityCategories(opp)
        if (!oppCategories.some((categoryId) => typeFilters.includes(categoryId))) return false
      }
      if (needsExperienceFilter && !opp.experienceNeeded?.trim()) return false
      if (experienceGainFilter && !opp.experienceYouCanGet?.trim()) return false
      return true
    })
  }, [opportunities, cadenceFilter, typeFilters, needsExperienceFilter, experienceGainFilter])

  const mainOpportunities = matched

  const commitmentLabel = CADENCES.find((c) => c.id === cadenceFilter)?.label || CADENCES[0].label

  const hasActiveFilters =
    query.trim() !== "" ||
    cadenceFilter !== "all" ||
    typeFilters.length > 0 ||
    needsExperienceFilter ||
    experienceGainFilter
  const selectedTypeTones = typeFilters.map((id) => CATEGORY_FILTER_TONES[id]).filter(Boolean)
  const typeStripeSize = 16
  const typeStripeBackground = `repeating-linear-gradient(90deg, ${selectedTypeTones
    .map((tone, idx) => `${tone} ${idx * typeStripeSize}px ${(idx + 1) * typeStripeSize}px`)
    .join(", ")})`
  const typeFilterStyle = selectedTypeTones.length === 0 ? undefined : {
    background: typeStripeBackground,
    borderColor: selectedTypeTones.length === 1 ? selectedTypeTones[0] : "transparent",
    color: typeFilters.some((id) => id === "external" || id === "group")
      ? "var(--linen)"
      : "var(--prussian-blue)",
  }

  async function toggleStar(id) {
    if (!user) { signIn(); return }
    const isStarred = starredIds.has(id)
    setStarredIds((prev) => {
      const next = new Set(prev)
      if (isStarred) next.delete(id)
      else next.add(id)
      return next
    })
    try {
      if (isStarred) await api.unstarOpportunity(id)
      else await api.starOpportunity(id)
    } catch {
      setStarredIds((prev) => {
        const next = new Set(prev)
        if (isStarred) next.add(id)
        else next.delete(id)
        return next
      })
    }
  }

  function startCreate() {
    setEditing("new")
    setDraft(emptyDraft())
    setFormMsg(null)
  }
  function startEdit(opp) {
    setEditing(opp.id)
    setDraft({
      id: opp.id,
      title: opp.title || "",
      organisation: opp.organisation || "",
      location: opp.location || "",
      description: opp.description || "",
      commitmentType: opp.commitmentType || "",
      experienceNeeded: opp.experienceNeeded || "",
      experienceYouCanGet: opp.experienceYouCanGet || "",
      sourceUrl: opp.sourceUrl?.startsWith("internal://") ? "" : (opp.sourceUrl || ""),
      categories: getOpportunityCategories(opp),
      causes: opp.causes || [],
      setDate: toDateInput(opp.setDate),
      expiryDate: toDateInput(opp.expiryDate),
    })
    setFormMsg(null)
  }
  function cancelEdit() {
    setEditing(null)
    setDraft(emptyDraft())
    setFormMsg(null)
  }

  async function submitForm(e) {
    e.preventDefault()
    if (!draft.title.trim()) return
    setSubmitting(true); setFormMsg(null)
    const payload = {
      title: draft.title.trim(),
      organisation: draft.organisation.trim() || undefined,
      location: draft.location.trim() || undefined,
      description: draft.description.trim() || undefined,
      commitmentType: draft.commitmentType.trim() || undefined,
      experienceNeeded: draft.experienceNeeded.trim() || undefined,
      experienceYouCanGet: draft.experienceYouCanGet.trim() || undefined,
      sourceUrl: draft.sourceUrl.trim() || undefined,
      category: draft.categories[0] || undefined,
      categories: draft.categories,
      causes: draft.causes,
      setDate: draft.setDate ? draft.setDate : null,
      expiryDate: draft.expiryDate ? draft.expiryDate : null,
    }
    try {
      if (draft.id) {
        await api.updateOpportunity(draft.id, payload)
        setSelectedOpp(null)
      }
      else await api.createOpportunity(payload)
      setEditing(null)
      setDraft(emptyDraft())
      load()
    } catch (err) {
      setFormMsg({ ok: false, text: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  function closeModal() {
    setSelectedOpp(null)
    if (editing && editing !== "new") cancelEdit()
  }

  return (
    <>
      <div className="uvs-controls">
        <label className="uvs-search">
          <span className="uvs-sr">Search opportunities</span>
          <input
            type="search"
            placeholder="Search opportunities…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>

        <div className="uvs-controls-row">
          <details className="uvs-multi-filter">
            <summary className={`uvs-filter uvs-filter--dropdown${cadenceFilter !== "all" ? " is-active" : ""}`}>
              Commitment: {commitmentLabel}
            </summary>
            <div className="uvs-multi-filter-menu" role="group" aria-label="Filter by commitment level">
              {CADENCES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`uvs-single-filter-option${cadenceFilter === c.id ? " is-active" : ""}`}
                  onClick={(e) => {
                    setCadenceFilter(c.id)
                    e.currentTarget.closest("details")?.removeAttribute("open")
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </details>

          <details className="uvs-multi-filter">
            <summary
              className={`uvs-filter uvs-filter--dropdown${typeFilters.length > 0 ? " is-active" : ""}`}
              style={typeFilterStyle}
            >
              {typeFilters.length > 0 ? `Types (${typeFilters.length})` : "Volunteering type"}
            </summary>
            <div className="uvs-multi-filter-menu" role="group" aria-label="Filter by volunteering type">
              {CATEGORY_OPTIONS.map((type) => (
                <label key={type.id} className="uvs-multi-filter-option">
                  <input
                    type="checkbox"
                    checked={typeFilters.includes(type.id)}
                    onChange={() => toggleTypeFilter(type.id)}
                  />
                  <span>{type.label}</span>
                </label>
              ))}
            </div>
          </details>
          <button
            type="button"
            className={`uvs-filter${needsExperienceFilter ? " is-active" : ""}`}
            aria-pressed={needsExperienceFilter}
            onClick={() => setNeedsExperienceFilter((prev) => !prev)}
          >
            Experience needed
          </button>
          <button
            type="button"
            className={`uvs-filter${experienceGainFilter ? " is-active" : ""}`}
            aria-pressed={experienceGainFilter}
            onClick={() => setExperienceGainFilter((prev) => !prev)}
          >
            Experience you can get
          </button>

          {isCommittee && editing !== "new" && (
            <button type="button" className="uvs-cta uvs-cta-primary uvs-add-btn" onClick={startCreate}>
              + New opportunity
            </button>
          )}
        </div>
      </div>

      {isCommittee && editing === "new" && (
        <div className="uvs-dash-card uvs-edit-panel">
          <h3 className="uvs-dash-card-title">
            {draft.id ? "Edit opportunity" : "New opportunity"}
          </h3>
          <OpportunityForm
            draft={draft}
            onChange={setDraft}
            onSubmit={submitForm}
            onCancel={cancelEdit}
            submitting={submitting}
            msg={formMsg}
          />
        </div>
      )}

      {error && <p className="uvs-lb-error">{error}</p>}
      {loading && (
        <div className="uvs-opp-loading" role="status" aria-label="Loading opportunities">
          <span className="uvs-opp-loading-stripe" aria-hidden="true" />
          <span className="uvs-opp-loading-stripe" aria-hidden="true" />
          <span className="uvs-opp-loading-stripe" aria-hidden="true" />
          <span className="uvs-opp-loading-stripe" aria-hidden="true" />
        </div>
      )}

      {!loading && (
        <section className="uvs-opps-section">
          <div className="uvs-opps-section-head">
            <h3 className="uvs-opps-section-title">{user ? "Main opportunities" : "Opportunities"}</h3>
            <span className="uvs-opps-section-count">{mainOpportunities.length}</span>
          </div>

          {mainOpportunities.length > 0 && (
            <Motion.div layout className="uvs-cards uvs-cards--compact">
              <AnimatePresence mode="popLayout" initial={false}>
                {mainOpportunities.map((opp) => (
                  <OpportunityCard
                    key={opp.id}
                    opp={opp}
                    onToggle={() => setSelectedOpp(opp)}
                    isCommittee={isCommittee}
                    onEdit={() => { setSelectedOpp(opp); startEdit(opp) }}
                    starred={starredIds.has(opp.id)}
                    onStar={() => toggleStar(opp.id)}
                    isFocused={focusedOppId === opp.id}
                    onFocusCard={() => setFocusedOppId(opp.id)}
                    onBlurCard={() => setFocusedOppId((curr) => curr === opp.id ? null : curr)}
                  />
                ))}
              </AnimatePresence>
            </Motion.div>
          )}

          {mainOpportunities.length === 0 && !error && (
            <p className="uvs-empty uvs-empty--compact">
              {hasActiveFilters ? "Nothing matches yet — try clearing a filter." : "No opportunities available right now."}
            </p>
          )}
        </section>
      )}

      {hasMore && (
        <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />
      )}
      {loadingMore && (
        <div className="uvs-opp-loading" role="status" aria-label="Loading more opportunities">
          <span className="uvs-opp-loading-stripe" aria-hidden="true" />
          <span className="uvs-opp-loading-stripe" aria-hidden="true" />
          <span className="uvs-opp-loading-stripe" aria-hidden="true" />
          <span className="uvs-opp-loading-stripe" aria-hidden="true" />
        </div>
      )}

      <AnimatePresence>
        {selectedOpp && (
          <OpportunityModal
            key={selectedOpp.id}
            opp={selectedOpp}
            onClose={closeModal}
            isCommittee={isCommittee}
            onEdit={() => startEdit(selectedOpp)}
            starred={starredIds.has(selectedOpp.id)}
            onStar={() => toggleStar(selectedOpp.id)}
            isEditing={editing === selectedOpp.id}
            draft={draft}
            onDraftChange={setDraft}
            onSubmitEdit={submitForm}
            onCancelEdit={cancelEdit}
            submitting={submitting}
            formMsg={formMsg}
          />
        )}
      </AnimatePresence>
    </>
  )
}

export default function Dashboard({ tab = "map", onNavigate }) {
  const { user, loading: authLoading } = useAuth()
  const committeeStatus = useCommitteeStatus(user)
  const isCommittee = committeeStatus === true
  const { opportunities, loading: oppsLoading, error: oppsError } = useAllOpportunities()

  const tabs = useMemo(() => {
    return [
      { id: "map", label: "Map" },
      { id: "upcoming", label: "Upcoming" },
      { id: "directory", label: "Directory" },
    ]
  }, [])

  const selectTab = useCallback((next) => {
    if (next === tab) return
    const target = TAB_HASHES[next]
    if (onNavigate) onNavigate(target)
    else window.location.hash = target
  }, [tab, onNavigate])

  function goHome() {
    if (onNavigate) onNavigate("#/")
    else window.location.hash = "#/"
  }

  const activeTab = TAB_HASHES[tab] ? tab : "map"

  return (
    <div className="uvs">
      <section className="uvs-section uvs-section--dashboard">
        <div className="uvs-section-head uvs-section-head--toggle">
          <div className="uvs-section-head-meta">
            <button
              type="button"
              className="uvs-section-home"
              onClick={goHome}
              aria-label="Back to home"
            >
              ← Home
            </button>
            <div className="uvs-section-auth">
              {!authLoading && user && (
                <>
                  <span className="uvs-section-user">{user.name || user.email}</span>
                  <button
                    type="button"
                    className="uvs-section-signout"
                    onClick={signOut}
                  >
                    Sign out
                  </button>
                </>
              )}
              {!authLoading && !user && (
                <button
                  type="button"
                  className="uvs-section-signout"
                  onClick={signIn}
                >
                  Sign in
                </button>
              )}
            </div>
          </div>

          <div
            className="uvs-title-toggle"
            role="tablist"
            aria-label="Section"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={activeTab === t.id}
                className={`uvs-title-toggle-btn${activeTab === t.id ? " is-active" : ""}`}
                onClick={() => selectTab(t.id)}
              >
                {t.label}
                {activeTab === t.id && (
                  <Motion.span
                    layoutId="tab-underline"
                    className="uvs-title-underline"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
              </button>
            ))}
          </div>

          <p className="uvs-section-lede">{LEDES[activeTab]}</p>
        </div>

        {activeTab === "map" && (
          <MapPanel
            opportunities={opportunities}
            loading={oppsLoading}
            error={oppsError}
          />
        )}
        {activeTab === "upcoming" && (
          <UpcomingPanel
            opportunities={opportunities}
            loading={oppsLoading}
            error={oppsError}
            onBrowse={() => selectTab("directory")}
          />
        )}
        {activeTab === "directory" && <OpportunitiesPanel isCommittee={isCommittee} />}
      </section>
    </div>
  )
}
