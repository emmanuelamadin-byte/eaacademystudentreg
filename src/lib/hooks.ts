"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase's dynamic table mapping cannot be expressed through generated table literals. */
import { useEffect, useState } from "react";
import { getSupabase } from "./supabase";
import {
  collectionSpec,
  databaseField,
  documentFilters,
  rowFromDatabase,
  selectionFor,
} from "./supabase-data";

export type RecordFilter = [
  string,
  "==" | "in" | "array-contains",
  unknown,
];

function message(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load academy data.";
}

export function useRecords<T>(
  name: string,
  filters: RecordFilter[] = [],
  enabled = true,
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setData([]);
    setError(null);
    const supabase = getSupabase();
    if (!supabase || !enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const parsed: RecordFilter[] = JSON.parse(filterKey);
    let cancelled = false;
    const spec = collectionSpec(name);
    const load = async () => {
      try {
        let request: any = supabase.from(spec.table).select(selectionFor(name));
        for (const [field, operator, value] of parsed) {
          if (name === "comments" && field === "parentId") {
            request = request.or(
              `discussion_id.eq.${value},project_id.eq.${value}`,
            );
            continue;
          }
          const column = databaseField(name, field);
          if (operator === "==") request = request.eq(column, value);
          else if (operator === "in") request = request.in(column, value);
          else request = request.contains(column, [value]);
        }
        const { data: rows, error: requestError } = await request;
        if (requestError) throw requestError;
        if (cancelled) return;
        setData((rows || []).map((row: Record<string, unknown>) => rowFromDatabase(name, row) as T));
        setError(null);
        setLoading(false);
      } catch (cause) {
        if (cancelled) return;
        setError(message(cause));
        setLoading(false);
      }
    };
    void load();
    const channel = supabase
      .channel(`academy:${spec.table}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: spec.table },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [name, filterKey, enabled]);
  return { data, loading, error };
}
export function useRecord<T>(
  name: string,
  id: string | undefined,
  enabled = true,
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData(null);
    setError(null);
    const supabase = getSupabase();
    if (!supabase || !id || !enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const spec = collectionSpec(name, id);
    const load = async () => {
      try {
        let request: any = supabase.from(spec.table).select(selectionFor(name));
        for (const [field, value] of Object.entries(documentFilters(name, id))) {
          request = request.eq(field, value);
        }
        const { data: row, error: requestError } = await request.maybeSingle();
        if (requestError) throw requestError;
        if (cancelled) return;
        setData(row ? (rowFromDatabase(name, row) as T) : null);
        setError(null);
        setLoading(false);
      } catch (cause) {
        if (cancelled) return;
        setError(message(cause));
        setLoading(false);
      }
    };
    void load();
    const channel = supabase
      .channel(
        `academy:${spec.table}:${id}:${Math.random().toString(36).slice(2)}`,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: spec.table },
        () => void load(),
      )
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [name, id, enabled]);
  return { data, loading, error };
}
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
