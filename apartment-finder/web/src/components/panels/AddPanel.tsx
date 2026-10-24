import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { postManualIngestServer } from '@/lib/api';
import { shekels } from '@/lib/utils';

export function AddPanel() {
  const [text, setText] = React.useState('');
  const [url, setUrl] = React.useState('');
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  const submit = async () => {
    if (text.trim().length < 20) {
      setResult({ ok: false, message: 'That text is too short.' });
      return;
    }
    try {
      const result = await postManualIngestServer(text.trim(), url.trim() || undefined);
      const p = result.parsed;
      setResult({
        ok: true,
        message: result.note
          ? `Parsed ${shekels(p.priceIls)} · ${p.rooms ?? '?'} rooms — but it does not match your criteria.`
          : `Added: ${shekels(p.priceIls)} · ${p.rooms ?? '?'} rooms · ${p.city || 'city not detected'}`,
      });
      setText('');
      setUrl('');
    } catch (err) {
      setResult({ ok: false, message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return (
    <Card className="p-3">
      <h2 className="text-base font-semibold mb-1.5">Add a listing by hand</h2>
      <p className="text-muted-foreground text-sm mb-3">
        Copy a post from a Facebook group (or anywhere else) and paste it here. The price, room count, size and area
        are pulled out automatically, and the listing is then tracked for price drops exactly like a scraped one.
      </p>
      <Textarea
        rows={8}
        dir="auto"
        placeholder="Paste the post text here…"
        className="mb-2.5"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Input type="url" placeholder="Link (optional)" className="mb-2.5" value={url} onChange={(e) => setUrl(e.target.value)} />
      <Button onClick={submit}>Add listing</Button>
      {result && (
        <div
          className={`mt-2.5 p-2.5 rounded-md text-[13.5px] ${result.ok ? 'bg-success/15 text-success' : 'bg-destructive/15 text-destructive'}`}
        >
          {result.message}
        </div>
      )}
    </Card>
  );
}
