"use client";

import Link from "next/link";
import { Bell, ChevronRight, LayoutDashboard, LogOut, Search, UserRound } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

export type TopbarSearchItem = {
  title: string;
  subtitle: string;
  href: string;
  group: string;
};

export type TopbarNotification = {
  id: string;
  type: string;
  title: string;
  message: string;
  href: string;
  time: string;
};

type TopbarPayload = {
  notifications?: TopbarNotification[];
  profileHref?: string;
  searchItems?: TopbarSearchItem[];
};

type DropdownState = "search" | "notifications" | "profile" | null;
type TopbarScope = Exclude<DropdownState, null>;

const STORAGE_KEY = "mvc_topbar_read_notifications";

export function TopbarDropdowns({
  displayName,
  profileHref,
}: {
  displayName: string;
  profileHref?: string;
}) {
  const [open, setOpen] = useState<DropdownState>(null);
  const [query, setQuery] = useState("");
  const [readIds, setReadIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<TopbarNotification[]>([]);
  const [profileHrefState, setProfileHrefState] = useState(profileHref || "/admin");
  const [searchItems, setSearchItems] = useState<TopbarSearchItem[]>([]);
  const [loadedScopes, setLoadedScopes] = useState<TopbarScope[]>([]);
  const [loadingScope, setLoadingScope] = useState<TopbarScope | null>(null);
  const loadingRef = useRef<Set<TopbarScope>>(new Set());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setReadIds(JSON.parse(stored));
    } catch {
      setReadIds([]);
    }
  }, []);

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

  const filteredSearchItems = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const matches = needle
      ? searchItems.filter((item) =>
          `${item.title} ${item.subtitle} ${item.group}`.toLowerCase().includes(needle),
        )
      : searchItems;
    return matches.slice(0, 10);
  }, [deferredQuery, searchItems]);

  const readIdSet = useMemo(() => new Set(readIds), [readIds]);
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !readIdSet.has(notification.id)).length,
    [notifications, readIdSet],
  );

  async function loadTopbarData(scope: TopbarScope) {
    if (loadedScopes.includes(scope) || loadingRef.current.has(scope)) return;

    loadingRef.current.add(scope);
    setLoadingScope(scope);
    try {
      const response = await fetch(`/api/topbar?scope=${scope}`, { credentials: "same-origin" });
      if (!response.ok) return;

      const payload = (await response.json()) as TopbarPayload;
      if (Array.isArray(payload.notifications)) setNotifications(payload.notifications);
      if (Array.isArray(payload.searchItems)) setSearchItems(payload.searchItems);
      if (payload.profileHref) setProfileHrefState(payload.profileHref);
      setLoadedScopes((current) => (current.includes(scope) ? current : [...current, scope]));
    } catch {
      // Dropdown data can be retried next time without breaking the main page.
    } finally {
      loadingRef.current.delete(scope);
      setLoadingScope(null);
    }
  }

  function openDropdown(next: Exclude<DropdownState, null>) {
    setOpen(open === next ? null : next);
    if (open !== next) void loadTopbarData(next);
  }

  function persistReadIds(ids: string[]) {
    setReadIds(ids);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      // Reading notifications should never block navigation.
    }
  }

  function markRead(id: string) {
    if (readIds.includes(id)) return;
    persistReadIds([...readIds, id]);
  }

  function markAllRead() {
    persistReadIds(notifications.map((notification) => notification.id));
  }

  function goToFirstSearchResult() {
    const firstResult = filteredSearchItems[0];
    if (firstResult) window.location.assign(firstResult.href);
  }

  return (
    <div className="topActions" ref={rootRef}>
      <div className="topbarControl topbarSearchControl">
        <div className={`topSearch ${open === "search" ? "active" : ""}`}>
          <Search size={18} aria-hidden="true" />
          <input
            aria-label="Search portal"
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen("search");
              void loadTopbarData("search");
            }}
            onFocus={() => {
              setOpen("search");
              void loadTopbarData("search");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goToFirstSearchResult();
              }
            }}
            placeholder="Search"
            value={query}
          />
        </div>
        {open === "search" ? (
          <div className="topDropdown searchDropdown">
            <div className="topDropdownHeader">
              <strong>Search Portal</strong>
              <span>{filteredSearchItems.length} result{filteredSearchItems.length === 1 ? "" : "s"}</span>
            </div>
            <div className="topDropdownList">
              {loadingScope === "search" && !loadedScopes.includes("search") ? (
                <div className="topDropdownEmpty">Loading search...</div>
              ) : filteredSearchItems.length ? (
                filteredSearchItems.map((item) => (
                  <Link
                    className="topDropdownItem"
                    href={item.href}
                    key={`${item.group}-${item.href}-${item.title}`}
                    onClick={() => setOpen(null)}
                  >
                    <span>
                      <small>{item.group}</small>
                      <strong>{item.title}</strong>
                      <p>{item.subtitle}</p>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" />
                  </Link>
                ))
              ) : (
                <div className="topDropdownEmpty">No matching records found.</div>
              )}
            </div>
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
              <button className="markReadButton" onClick={markAllRead} type="button">
                Mark all as read
              </button>
            </div>
            <div className="topDropdownList">
              {loadingScope === "notifications" && !loadedScopes.includes("notifications") ? (
                <div className="topDropdownEmpty">Loading notifications...</div>
              ) : notifications.length ? (
                notifications.map((notification) => {
                  const unread = !readIdSet.has(notification.id);
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
