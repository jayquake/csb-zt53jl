import * as React from 'react';
import { Toaster, toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { AppDataProvider, useAppContext } from '@/lib/app-context';
import { fetchStatusServer, startScanServer } from '@/lib/api';
import { FeedPanel } from '@/components/panels/FeedPanel';
import { MapPanel } from '@/components/panels/MapPanel';
import { SavedPanel } from '@/components/panels/SavedPanel';
import { AddPanel } from '@/components/panels/AddPanel';
import { SettingsPanel } from '@/components/panels/SettingsPanel';

function statusLine(ctx: ReturnType<typeof useAppContext>, scanning: boolean): string {
  const { mode, status } = ctx;
  if (mode === 'loading') return 'Loading…';
  if (!status) return 'Cannot reach the server';
  const parts = [`${status.counts.active} active`, `${status.counts.saved} saved`];
  const last = status.lastRun;
  if (last) {
    const when = new Date(last.startedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
    parts.push(`last scan ${when} · ${last.new} new`);
    if (last.errors && last.errors.length) parts.push(`⚠️ ${last.errors.length} source errors`);
  }
  if (scanning) parts.push('scanning now…');
  if (mode === 'static') parts.push('read-only');
  return parts.join(' · ');
}

function Shell() {
  const ctx = useAppContext();
  const { mode, status, refreshStatus, bootError } = ctx;
  const [scanning, setScanning] = React.useState(false);

  const runScan = async () => {
    setScanning(true);
    try {
      await startScanServer();
      toast('Scan started — this takes a few minutes');
      // Poll until the run finishes, then refresh the status line.
      const poll = setInterval(async () => {
        const s = await fetchStatusServer().catch(() => null);
        if (s && !s.scanning) {
          clearInterval(poll);
          setScanning(false);
          await refreshStatus();
        }
      }, 5000);
    } catch (err) {
      toast(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setScanning(false);
    }
  };

  return (
    <div>
      <header className="sticky top-0 z-20 bg-card border-b border-border px-3.5 pt-2.5 pb-2.5">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-lg font-semibold tracking-tight m-0">TLV Apartments</h1>
          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            {mode === 'server' && (
              <Button size="sm" disabled={scanning || status?.scanning} onClick={runScan}>
                Scan now
              </Button>
            )}
          </div>
        </div>
        <div className="text-muted-foreground text-[12.5px] mt-1">{statusLine(ctx, scanning || !!status?.scanning)}</div>
      </header>

      {bootError && (
        <p className="text-center text-muted-foreground py-10 px-4">Could not load data.json: {bootError}</p>
      )}

      {!bootError && (
        <Tabs defaultValue="feed">
          <TabsList>
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="map">Map</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
            {mode !== 'static' && <TabsTrigger value="add">Add</TabsTrigger>}
            <TabsTrigger value="settings">Criteria</TabsTrigger>
          </TabsList>
          <main className="px-2.5 pt-3 pb-10 max-w-[720px] mx-auto">
            <TabsContent value="feed">
              <FeedPanel />
            </TabsContent>
            <TabsContent value="map">
              <MapPanel />
            </TabsContent>
            <TabsContent value="saved">
              <SavedPanel />
            </TabsContent>
            {mode !== 'static' && (
              <TabsContent value="add">
                <AddPanel />
              </TabsContent>
            )}
            <TabsContent value="settings">
              <SettingsPanel />
            </TabsContent>
          </main>
        </Tabs>
      )}

      <Toaster position="bottom-center" />
    </div>
  );
}

export default function App() {
  return (
    <AppDataProvider>
      <Shell />
    </AppDataProvider>
  );
}
