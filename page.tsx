"use client";
// app/results/page.tsx — career recommendation results dashboard
import { useEffect, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "@/components/shared/ProtectedRoute";
import Navbar from "@/components/shared/Navbar";
import CareerCard from "@/components/results/CareerCard";
import StreamSwitchSection from "@/components/results/StreamSwitchCard";
import RoadmapTimeline from "@/components/results/RoadmapTimeline";
import { useAuth } from "@/context/AuthContext";
import { getStudentProfile, saveRecommendation, getRecommendationHistory } from "@/lib/firestore";
import { getRoadmap } from "@/lib/api";
import type { RecommendationResult, RoadmapItem, StudentProfile, RecommendRequest } from "@/types";

// Strip Firestore-only fields before sending to the recommendation API
function toRecommendRequest(profile: StudentProfile): RecommendRequest {
  const { uid, name, onboardingComplete, createdAt, updatedAt, ...rest } = profile;
  return rest as RecommendRequest;
}

export default function ResultsPage() {
  const { user } = useAuth();

  const [result, setResult]           = useState<RecommendationResult | null>(null);
  const [profile, setProfile]         = useState<StudentProfile | null>(null);
  const [roadmap, setRoadmap]         = useState<RoadmapItem[]>([]);
  const [roadmapFor, setRoadmapFor]   = useState<string>("");
  const [timeframe, setTimeframe]     = useState<7 | 30 | 90>(30);
  const [loading, setLoading]         = useState(true);
  const [backendDown, setBackendDown] = useState(false);

  useEffect(() => {
    async function load() {
      if (!user) { setLoading(false); return; }

      // 1. Try sessionStorage first (fastest)
      const stored = sessionStorage.getItem("latestRecommendation");
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as RecommendationResult;
          setResult(parsed);
        } catch {
          setBackendDown(true);
        }
      } else {
        // 2. Fall back to latest Firestore record
        try {
          const history = await getRecommendationHistory(user.uid);
          if (history.length > 0) {
            const latest = history[0];
            const rec: RecommendationResult = {
              mode:                 latest.mode,
              topCareers:           latest.topCareers,
              alternatives:         latest.alternatives,
              streamSwitchPathways: latest.streamSwitchPathways,
              resources:            latest.resources,
              generatedAt:          latest.generatedAt,
            };
            setResult(rec);
            sessionStorage.setItem("latestRecommendation", JSON.stringify(rec));
          } else {
            setBackendDown(true);
          }
        } catch {
          setBackendDown(true);
        }
      }

      // 3. Load profile for context
      const p = await getStudentProfile(user.uid);
      setProfile(p);
      setLoading(false);
    }
    load();
  }, [user]);

  async function handleRoadmapRequest(careerId: string) {
    if (!profile || roadmapFor === careerId) return;
    setRoadmapFor(careerId);
    try {
      const steps = await getRoadmap({
        profile: toRecommendRequest(profile),
        selectedCareerId: careerId,
        timeframe,
      });
      setRoadmap(steps);
    } catch {
      // Backend not running — roadmap section stays hidden
      console.warn("Roadmap API not reachable");
    }
  }

  if (loading) {
    return (
      <ProtectedRoute>
        <Navbar />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500">Loading your results…</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">

          {/* ── Page header ──────────────────────────────────────── */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {result?.mode === "exploration"
                ? "Your exploration recommendations"
                : "Your career recommendations"}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {result?.mode === "exploration"
                ? "Based on your profile, we've suggested fields to explore. These are starting points — not final decisions."
                : "Your best-fit career matches based on your profile."}
            </p>
            {result && (
              <span className={`inline-block mt-2 text-xs font-medium px-3 py-1 rounded-full border ${
                result.mode === "exploration"
                  ? "bg-purple-50 text-purple-700 border-purple-200"
                  : "bg-green-50 text-green-700 border-green-200"
              }`}>
                {result.mode === "exploration" ? "🧭 Exploration mode" : "🎯 Best-fit mode"}
              </span>
            )}
          </div>

          {/* ── Backend down notice ──────────────────────────────── */}
          {backendDown && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
              <p className="font-semibold text-amber-800">
                ⚠️ Recommendations not available yet
              </p>
              <p className="text-sm text-amber-700">
                Your profile is saved. To generate recommendations, start the FastAPI backend then re-submit your profile:
              </p>
              <pre className="text-xs bg-white border border-amber-200 rounded-lg p-3 text-gray-700 overflow-x-auto whitespace-pre-wrap">
{`cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\\Scripts\\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000`}
              </pre>
              <Link href="/onboarding" className="btn-primary text-sm inline-block">
                Re-submit profile →
              </Link>
            </div>
          )}

          {/* ── Top careers ──────────────────────────────────────── */}
          {result && result.topCareers.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                {result.mode === "exploration" ? "Fields to explore" : "Top career matches"}
              </h2>
              {result.topCareers.map((career, i) => (
                <div key={career.careerId}>
                  <CareerCard career={career} rank={i + 1} isTop={i === 0} />

                  {/* Roadmap trigger beneath top career */}
                  {i === 0 && (
                    <div className="mt-3 ml-1 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-gray-400">Get a roadmap:</span>
                      {([7, 30, 90] as const).map((tf) => (
                        <button
                          key={tf}
                          onClick={() => { setTimeframe(tf); handleRoadmapRequest(career.careerId); }}
                          className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                            roadmapFor === career.careerId && timeframe === tf
                              ? "bg-primary-600 text-white border-primary-600"
                              : "bg-white text-gray-600 border-gray-200 hover:border-primary-300"
                          }`}
                        >
                          {tf}-day
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* ── Roadmap ──────────────────────────────────────────── */}
          {roadmap.length > 0 && roadmapFor && result && (
            <RoadmapTimeline
              steps={roadmap}
              timeframe={timeframe}
              careerName={result.topCareers.find((c) => c.careerId === roadmapFor)?.name ?? roadmapFor}
            />
          )}

          {/* ── Stream-switch pathways ───────────────────────────── */}
          {result && result.streamSwitchPathways.length > 0 && (
            <StreamSwitchSection
              pathways={result.streamSwitchPathways}
              fromStream={profile?.stream ?? "your current stream"}
            />
          )}

          {/* ── Alternatives ────────────────────────────────────── */}
          {result && result.alternatives.length > 0 && (
            <section className="card space-y-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Also consider</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Related careers that also matched your profile.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.alternatives.map((alt) => (
                  <span
                    key={alt.careerId}
                    className="px-3 py-1.5 bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-full"
                  >
                    {alt.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ── Generated at ────────────────────────────────────── */}
          {result?.generatedAt && (
            <p className="text-xs text-gray-400 text-center">
              Generated {new Date(result.generatedAt).toLocaleString("en-IN", {
                day: "numeric", month: "short", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}

          {/* ── Bottom actions ───────────────────────────────────── */}
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href="/onboarding" className="btn-secondary text-sm">← Update profile</Link>
            <Link href="/history"    className="btn-secondary text-sm">View history</Link>
            <Link href="/dashboard"  className="btn-primary  text-sm">Dashboard →</Link>
          </div>

          <p className="text-xs text-gray-400 text-center pb-6">
            These recommendations are informational only — not official career counseling.
            Always verify eligibility directly with the relevant authority.
          </p>
        </div>
      </div>
    </ProtectedRoute>
  );
}
