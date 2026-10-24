import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAppContext } from '@/lib/app-context';
import { fetchCriteriaServer, saveCriteriaServer } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { SearchCriteria } from '@/lib/types';

function csv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function numOrUndefined(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** A native <select multiple> is the right control on a phone — it gets the
 * platform picker and needs no custom scroll handling. */
function MultiSelect({
  options,
  selected,
  onChange,
  disabled,
  size = 8,
}: {
  options: Array<{ value: string; label: string; count: number }>;
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  size?: number;
}) {
  // Anything already saved but absent from the current data must still show,
  // or saving the form would silently drop it.
  const values = new Set(options.map((o) => o.value));
  const extras = selected.filter((v) => !values.has(v)).map((v) => ({ value: v, label: v, count: 0 }));
  const all = [...options, ...extras];
  return (
    <select
      multiple
      size={size}
      disabled={disabled}
      className="w-full rounded-md border border-input bg-card p-1.5 text-[15px] disabled:opacity-75"
      value={selected}
      onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}
    >
      {all.map((o) => (
        <option key={o.value} value={o.value} className="p-1.5 rounded">
          {o.label}
          {o.count ? ` (${o.count})` : ''}
        </option>
      ))}
    </select>
  );
}

export function SettingsPanel() {
  const { mode, snapshot, areas } = useAppContext();
  const [criteria, setCriteria] = React.useState<SearchCriteria | null>(null);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);
  const readOnly = mode === 'static';

  React.useEffect(() => {
    (async () => {
      if (mode === 'static' && snapshot?.criteria) setCriteria(snapshot.criteria);
      else if (mode === 'server') {
        try {
          setCriteria(await fetchCriteriaServer());
        } catch {
          setCriteria(null);
        }
      }
    })();
  }, [mode, snapshot]);

  if (!criteria) return null;

  const set = <K extends keyof SearchCriteria>(key: K, value: SearchCriteria[K]) =>
    setCriteria((c) => (c ? { ...c, [key]: value } : c));
  const setPref = <K extends keyof SearchCriteria['preferences']>(key: K, value: SearchCriteria['preferences'][K]) =>
    setCriteria((c) => (c ? { ...c, preferences: { ...c.preferences, [key]: value } } : c));

  const save = async () => {
    try {
      await saveCriteriaServer(criteria);
      setResult({ ok: true, message: 'Saved. The next scan will use these criteria.' });
    } catch (err) {
      setResult({ ok: false, message: `Error: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  return (
    <Card className={cn('p-3', readOnly && '[&_input]:opacity-75 [&_input]:pointer-events-none')}>
      <h2 className="text-base font-semibold mb-1.5">Search criteria</h2>
      {readOnly && (
        <p className="mb-3 p-2.5 rounded-md border border-border text-muted-foreground text-[13px]">
          Read-only here. Edit these by running the app locally, then commit the snapshot.
        </p>
      )}

      <div className="grid grid-cols-2 gap-x-2.5">
        <Label>
          Min price ₪
          <Input
            type="number"
            inputMode="numeric"
            className="mt-1"
            disabled={readOnly}
            value={criteria.minPriceIls ?? ''}
            onChange={(e) => set('minPriceIls', numOrUndefined(e.target.value))}
          />
        </Label>
        <Label>
          Max price ₪
          <Input
            type="number"
            inputMode="numeric"
            className="mt-1"
            disabled={readOnly}
            value={criteria.maxPriceIls ?? ''}
            onChange={(e) => set('maxPriceIls', numOrUndefined(e.target.value))}
          />
        </Label>
        <Label>
          Min rooms
          <Input
            type="number"
            step={0.5}
            className="mt-1"
            disabled={readOnly}
            value={criteria.minRooms ?? ''}
            onChange={(e) => set('minRooms', numOrUndefined(e.target.value))}
          />
        </Label>
        <Label>
          Max rooms
          <Input
            type="number"
            step={0.5}
            className="mt-1"
            disabled={readOnly}
            value={criteria.maxRooms ?? ''}
            onChange={(e) => set('maxRooms', numOrUndefined(e.target.value))}
          />
        </Label>
        <Label>
          Min size (m²)
          <Input
            type="number"
            inputMode="numeric"
            className="mt-1"
            disabled={readOnly}
            value={criteria.minSizeSqm ?? ''}
            onChange={(e) => set('minSizeSqm', numOrUndefined(e.target.value))}
          />
        </Label>
        <Label>
          Ideal price ₪
          <Input
            type="number"
            inputMode="numeric"
            className="mt-1"
            disabled={readOnly}
            value={criteria.preferences.idealMaxPriceIls ?? ''}
            onChange={(e) => setPref('idealMaxPriceIls', numOrUndefined(e.target.value))}
          />
        </Label>
      </div>

      <Label className="mt-1">
        Cities (comma separated, in Hebrew)
        <Input
          dir="auto"
          className="mt-1"
          disabled={readOnly}
          value={criteria.cities.join(', ')}
          onChange={(e) => set('cities', csv(e.target.value))}
        />
      </Label>

      <Label>
        Areas to search
        <span className="block font-normal text-[11.5px] opacity-75 mt-0.5">Leave all unselected to search everywhere</span>
        <div className="mt-1">
          <MultiSelect
            options={areas}
            selected={criteria.neighborhoods}
            disabled={readOnly}
            onChange={(values) => set('neighborhoods', values)}
          />
        </div>
      </Label>

      <Label>
        Favourite areas <span className="font-normal text-[11.5px] opacity-75">scored higher, never required</span>
        <div className="mt-1">
          <MultiSelect
            options={areas}
            selected={criteria.preferences.favoriteNeighborhoods}
            disabled={readOnly}
            size={6}
            onChange={(values) => setPref('favoriteNeighborhoods', values)}
          />
        </div>
      </Label>

      <Label>
        Blocked keywords
        <Input
          dir="auto"
          className="mt-1"
          disabled={readOnly}
          value={criteria.excludeKeywords.join(', ')}
          onChange={(e) => set('excludeKeywords', csv(e.target.value))}
        />
      </Label>

      <div className="grid grid-cols-2 gap-x-2.5">
        <Label>
          Min score to alert
          <Input
            type="number"
            min={0}
            max={100}
            className="mt-1"
            disabled={readOnly}
            value={criteria.minScoreToAlert}
            onChange={(e) => set('minScoreToAlert', numOrUndefined(e.target.value) ?? 55)}
          />
        </Label>
        <Label>
          Min price drop %
          <Input
            type="number"
            min={0}
            max={100}
            className="mt-1"
            disabled={readOnly}
            value={criteria.minPriceDropPercent}
            onChange={(e) => set('minPriceDropPercent', numOrUndefined(e.target.value) ?? 3)}
          />
        </Label>
      </div>

      <Label>
        Posted by
        <div className="mt-1">
          <Select
            value={criteria.posterType}
            disabled={readOnly}
            onValueChange={(v) => set('posterType', v as SearchCriteria['posterType'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Anyone</SelectItem>
              <SelectItem value="private_only">Owners only (no realtor fee)</SelectItem>
              <SelectItem value="agency_only">Realtors only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Label>

      <label className="flex items-start gap-2 mb-3.5 leading-snug cursor-pointer">
        <Checkbox
          className="mt-0.5"
          disabled={readOnly}
          checked={!!criteria.strictPosterFilter}
          onCheckedChange={(v) => set('strictPosterFilter', !!v)}
        />
        <span className="text-sm text-foreground">Also drop listings that don't say who posted them</span>
      </label>

      <fieldset className="border border-border rounded-md p-3 mb-3.5">
        <legend className="text-xs text-muted-foreground px-1">Must have</legend>
        {([
          ['requireElevator', 'Elevator'],
          ['requireParking', 'Parking'],
          ['requireBalcony', 'Balcony'],
          ['requireSafeRoom', 'Safe room'],
        ] as const).map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-1.5 mt-1 ms-2.5 text-sm cursor-pointer">
            <Checkbox disabled={readOnly} checked={!!criteria[key]} onCheckedChange={(v) => set(key, !!v)} />
            {label}
          </label>
        ))}
      </fieldset>

      {!readOnly && <Button onClick={save}>Save</Button>}
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
