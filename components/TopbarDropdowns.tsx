"use client";

import Link from "next/link";
import { CaseStatusBadge } from "./CaseStatusBadge";
import { Bell, ChevronRight, LayoutDashboard, LogOut, Search, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type TopbarSearchItem = {
  title: string;
  subtitle: string;
  href: string;
  group: string;
  caseStatus?: string;
};

export type TopbarNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string;
  time: string;
  read: boolean;
  caseStatus?: string;
};

type NotificationFeed = {
  viewerId: number;
  notifications: TopbarNotification[];
  unreadCount: number;
  latestNotificationId: string | null;
};

type TopbarPayload = {
  notifications?: TopbarNotification[];
  profileHref?: string;
  searchItems?: TopbarSearchItem[];
  clientSearchHref?: string;
};

type DropdownState = "search" | "notifications" | "profile" | null;
type CachedTopbarScope = "profile";
type SearchStatus = "idle" | "loading" | "ready" | "error";

export function TopbarDropdowns({
  userId,
  displayName,
  profileHref,
}: {
  userId: number;
  displayName: string;
  profileHref?: string;
}) {
  const [open, setOpen] = useState<DropdownState>(null);
  const [query, setQuery] = useState("");
  const [notifications, setNotifications] = useState<TopbarNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestNotificationId, setLatestNotificationId] = useState<string | null>(null);
  const [notificationStatus, setNotificationStatus] = useState<"loading" | "ready" | "error">("loading");
  const [markingRead, setMarkingRead] = useState(false);
  const notificationSequenceRef = useRef(0);
  const [profileHrefState, setProfileHrefState] = useState(profileHref || "/admin");
  const [searchItems, setSearchItems] = useState<TopbarSearchItem[]>([]);
  const [clientSearchHref, setClientSearchHref] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResultQuery, setSearchResultQuery] = useState<string | null>(null);
  const [loadedScopes, setLoadedScopes] = useState<CachedTopbarScope[]>([]);
  const [loadingScope, setLoadingScope] = useState<CachedTopbarScope | null>(null);
  const loadingRef = useRef<Set<CachedTopbarScope>>(new Set());
  const searchControllerRef = useRef<AbortController | null>(null);
  const searchSequenceRef = useRef(0);
  const queryRef = useRef("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  function applyNotificationFeed(feed: NotificationFeed) {
    if (feed.viewerId !== userId) {
      setNotifications([]);
      setUnreadCount(0);
      setLatestNotificationId(null);
      setNotificationStatus("error");
      return;
    }
    setNotifications(feed.notifications);
    setUnreadCount(feed.unreadCount);
    setLatestNotificationId(feed.latestNotificationId);
    setNotificationStatus("ready");
  }

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    async function refreshNotifications() {
      if (document.hidden) return;
      const sequence = ++notificationSequenceRef.current;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch("/api/notifications", {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unable to load notifications.");
        const feed = await response.json() as NotificationFeed;
        if (active && sequence === notificationSequenceRef.current) applyNotificationFeed(feed);
      } catch {
        if (active && sequence === notificationSequenceRef.current) {
          setNotifications([]);
          setUnreadCount(0);
          setLatestNotificationId(null);
          setNotificationStatus("error");
        }
      }
    }
    void refreshNotifications();
    const timer = window.setInterval(refreshNotifications, 20000);
    window.addEventListener("focus", refreshNotifications);
    window.addEventListener("mvc-notifications-refresh", refreshNotifications);
    document.addEventListener("visibilitychange", refreshNotifications);
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshNotifications);
      window.removeEventListener("mvc-notifications-refresh", refreshNotifications);
      document.removeEventListener("visibilitychange", refreshNotifications);
    };
  }, [userId]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(null);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (open !== "search") return;

    const requestedQuery = query.trim();
    const sequence = ++searchSequenceRef.current;
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setSearchStatus("loading");
    setSearchResultQuery(null);
    setSearchItems([]);
    setClientSearchHref(null);

    const isCurrentRequest = () => !controller.signal.aborted && sequence === searchSequenceRef.current && queryRef.current.trim() === requestedQuery;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ scope: "search", q: requestedQuery });
        const response = await fetch(`/api/topbar?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Search request failed.");

        const payload = (await response.json()) as TopbarPayload;
        if (!Array.isArray(payload.searchItems)) throw new Error("Invalid search response.");
        if (!isCurrentRequest()) return;

        setSearchItems(payload.searchItems);
        setClientSearchHref(payload.clientSearchHref || null);
        setSearchResultQuery(requestedQuery);
        setSearchStatus("ready");
      } catch {
        if (!isCurrentRequest()) return;
        setSearchStatus("error");
      } finally {
        if (searchControllerRef.current === controller) searchControllerRef.current = null;
      }
    }, requestedQuery ? 250 : 0);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const currentSearchItems = searchStatus === "ready" && searchResultQuery === query.trim() ? searchItems : [];
  const currentClientSearchHref = searchStatus === "ready" && searchResultQuery === query.trim() && query.trim() ? clientSearchHref : null;
  const searchLoading = searchStatus === "idle" || searchStatus === "loading" || (searchStatus === "ready" && searchResultQuery !== query.trim());

  async function loadTopbarData(scope: CachedTopbarScope) {
    if (loadedScopes.includes(scope) || loadingRef.current.has(scope)) return;

    loadingRef.current.add(scope);
    setLoadingScope(scope);
    try {
      const response = await fetch(`/api/topbar?scope=${scope}`, { credentials: "same-origin" });
      if (!response.ok) return;

      const payload = (await response.json()) as TopbarPayload;
      if (payload.profileHref) setProfileHrefState(payload.profileHref);
      setLoadedScopes((current) => (current.includes(scope) ? current : [...current, scope]));
    } catch {
      // Dropdown data can be retried next time without breaking the main page.
    } finally {
      loadingRef.current.delete(scope);
      setLoadingScope((current) => current === scope ? null : current);
    }
  }

  function openDropdown(next: "notifications" | "profile") {
    setOpen(open === next ? null : next);
    if (open !== next) {
      if (next === "notifications") window.dispatchEvent(new Event("mvc-notifications-refresh"));
      else void loadTopbarData(next);
    }
  }

  function invalidateSearch() {
    searchControllerRef.current?.abort();
    searchSequenceRef.current += 1;
    setSearchItems([]);
    setClientSearchHref(null);
    setSearchResultQuery(null);
    setSearchStatus("loading");
  }

  async function updateReadState(selection: { ids: string[] } | { all: true; beforeId: string }) {
    const sequence = ++notificationSequenceRef.current;
    setMarkingRead(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(selection),
      });
      if (!response.ok) throw new Error("Unable to update notification.");
      const feed = await response.json() as NotificationFeed;
      if (sequence === notificationSequenceRef.current) applyNotificationFeed(feed);
    } catch {
      setNotificationStatus("error");
    } finally {
      setMarkingRead(false);
      window.dispatchEvent(new Event("mvc-notifications-refresh"));
    }
  }

  function markRead(id: string) {
    void updateReadState({ ids: [id] });
  }

  function markAllRead() {
    if (latestNotificationId) void updateReadState({ all: true, beforeId: latestNotificationId });
  }

  function goToFirstSearchResult() {
    if (open !== "search" || searchStatus !== "ready" || searchResultQuery !== queryRef.current.trim()) return;
    const firstResult = currentSearchItems[0];
    if (firstResult) window.location.assign(firstResult.href);
  }

  return (
    <div className="topActions" ref={rootRef}>
      <div className="topbarControl topbarSearchControl">
        <div className={`topSearch ${open === "search" ? "active" : ""}`}>
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search portal by name, client ID, reference, CNIC, phone, email or city"
            aria-controls="topbar-search-results"
            aria-expanded={open === "search"}
            onChange={(event) => {
              queryRef.current = event.target.value;
              invalidateSearch();
              setQuery(event.target.value);
              setOpen("search");
            }}
            onFocus={() => {
              if (open !== "search") invalidateSearch();
              setOpen("search");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goToFirstSearchResult();
              }
            }}
            placeholder="Search name, CNIC, phone or email"
            type="search"
            value={query}
          />
        </div>
        {open === "search" ? (
          <div className="topDropdown searchDropdown" id="topbar-search-results" aria-busy={searchLoading}>
            <div className="topDropdownHeader">
              <strong>Search Portal</strong>
              <span aria-live="polite">{searchLoading ? "Searching..." : searchStatus === "error" ? "Search unavailable" : `${currentSearchItems.length} result${currentSearchItems.length === 1 ? "" : "s"}`}</span>
            </div>
            <div className="topDropdownList">
              {searchLoading ? (
                <div className="topDropdownEmpty" role="status">Searching records...</div>
              ) : searchStatus === "error" ? (
                <div className="topDropdownEmpty" role="alert">Search is unavailable. Try again by changing the search or reopening it.</div>
              ) : currentSearchItems.length ? (
                currentSearchItems.map((item) => (
                  <Link
                    className="topDropdownItem"
                    href={item.href}
                    key={`${item.group}-${item.href}-${item.title}`}
                    onClick={() => setOpen(null)}
                  >
                    <span>
                      <small>{item.group}</small>
                      <strong>{item.title}</strong>
                      {item.caseStatus ? <CaseStatusBadge status={item.caseStatus} /> : null}
                      <p>{item.subtitle}</p>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                ))
              ) : (
                <div className="topDropdownEmpty" role="status">No matching records found.</div>
              )}
            </div>
            {currentClientSearchHref ? (
              <Link
                className="topDropdownItem"
                href={currentClientSearchHref}
                onClick={(event) => {
                  if (searchResultQuery !== queryRef.current.trim()) {
                    event.preventDefault();
                    return;
                  }
                  setOpen(null);
                }}
              >
                <strong>View all matching clients</strong>
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="topbarControl">
        <button
          aria-expanded={open === "notifications"}
          aria-label="Open notifications"
          className={`roundIcon ${open === "notifications" ? "active" : ""}`}
          onClick={() => openDropdown("notifications")}
          type="button"
        >
          <Bell size={20} aria-hidden="true" />
          {unreadCount ? <span>{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
        </button>
        {open === "notifications" ? (
          <div className="topDropdown notificationDropdown">
            <div className="topDropdownHeader">
              <strong>Notifications</strong>
              <button className="markReadButton" onClick={markAllRead} type="button" disabled={markingRead || !unreadCount}>
                Mark all as read
              </button>
            </div>
            <div className="topDropdownList">
              {notificationStatus === "loading" ? (
                <div className="topDropdownEmpty">Loading notifications...</div>
              ) : notificationStatus === "error" ? (
                <div className="topDropdownEmpty" role="alert">Unable to load notifications. <button className="markReadButton" type="button" onClick={() => window.dispatchEvent(new Event("mvc-notifications-refresh"))}>Retry</button></div>
              ) : notifications.length ? (
                notifications.map((notification) => {
                  const unread = !notification.read;
                  return (
                    <Link
                      className={`topDropdownItem notificationItem ${unread ? "unread" : ""}`}
                      href={notification.href}
                      key={notification.id}
                      onClick={() => {
                        markRead(notification.id);
                        setOpen(null);
                      }}
                    >
                      <span>
                        <strong>
                          <span className="notificationType">{notification.type}:</span> {notification.message}
                        </strong>
                        {notification.time ? <p>{notification.time}</p> : null}
                        {notification.caseStatus ? <CaseStatusBadge status={notification.caseStatus} /> : null}
                      </span>
                      {unread ? <i aria-label="Unread notification" /> : null}
                    </Link>
                  );
                })
              ) : (
                <div className="topDropdownEmpty">No notifications yet.</div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <div className="topbarControl">
        <button
          aria-expanded={open === "profile"}
          aria-label="Open profile menu"
          className={`topAvatar ${open === "profile" ? "active" : ""}`}
          onClick={() => openDropdown("profile")}
          type="button"
        >
          <UserRound size={24} aria-hidden="true" />
        </button>
        {open === "profile" ? (
          <div className="topDropdown profileDropdown">
            <div className="profileCardHeader">
              <strong>{displayName}</strong>
              <span>Signed in</span>
            </div>
            <Link className="profileMenuLink" href="/admin" onClick={() => setOpen(null)}>
              <LayoutDashboard size={17} aria-hidden="true" />
              Dashboard
            </Link>
            <Link className="profileMenuLink" href={profileHrefState} onClick={() => setOpen(null)}>
              <UserRound size={17} aria-hidden="true" />
              Profile
            </Link>
            <form action="/logout" method="post">
              <button className="profileLogoutButton" type="submit">
                <LogOut size={17} aria-hidden="true" />
                Logout
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
