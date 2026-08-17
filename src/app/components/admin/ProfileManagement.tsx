import { useEffect, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import {
  deleteInternProfile,
  ensureInternProfileForUser,
  identityForLabSession,
  listInternProfiles,
  upsertInternProfile,
  type AppUserIdentity,
  type InternProfile,
  type InternProfileStatus,
} from '../../lib/internProfiles';

interface ProfileManagementProps {
  currentUser: AppUserIdentity;
}

const emptyForm = (user?: AppUserIdentity) => ({
  id: '',
  appUserId: user?.id || '',
  appUserName: user?.name || '',
  appUserEmail: user?.email || '',
  awsIdentityCenterUsername: user?.email?.split('@')[0] || '',
  awsIdentityCenterEmail: user?.email || '',
  awsAccountId: '483591406604',
  permissionSetName: 'LearningLabSandbox',
  status: 'active' as InternProfileStatus,
  notes: '',
});

export default function ProfileManagement({ currentUser }: ProfileManagementProps) {
  const [profiles, setProfiles] = useState<InternProfile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState('');
  const [form, setForm] = useState(emptyForm(currentUser));
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const refreshProfiles = async (preferredId?: string) => {
    const next = await listInternProfiles();
    setProfiles(next);
    const selected = next.find((profile) => profile.id === (preferredId || selectedProfileId)) || next[0] || null;
    setSelectedProfileId(selected?.id || '');
    setForm(selected ? { ...emptyForm(currentUser), ...selected } : emptyForm(currentUser));
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setErrorMessage('');
      try {
        const ensured = await ensureInternProfileForUser(currentUser);
        if (cancelled) return;
        await refreshProfiles(ensured.id);
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : 'Unable to load profiles.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [currentUser]);

  const handleSave = async () => {
    setErrorMessage('');
    setIsLoading(true);
    try {
      const saved = await upsertInternProfile({
        ...form,
        appUserId: form.appUserId || currentUser.id,
        appUserName: form.appUserName || currentUser.name,
        appUserEmail: form.appUserEmail || currentUser.email,
      });
      await refreshProfiles(saved.id);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to save profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProfileId) return;
    setIsLoading(true);
    setErrorMessage('');
    try {
      await deleteInternProfile(selectedProfileId);
      await refreshProfiles();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to delete profile.');
    } finally {
      setIsLoading(false);
    }
  };

  const identity = identityForLabSession(currentUser);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Identity configuration</CardTitle>
          <CardDescription>Manage platform-to-AWS identity assignments for the shared sandbox.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm md:grid-cols-2">
          <div className="space-y-2 text-slate-600">
            <p><span className="font-medium text-slate-900">Admin:</span> {currentUser.name}</p>
            <p><span className="font-medium text-slate-900">Email:</span> {currentUser.email}</p>
          </div>
          <div className="flex flex-wrap content-start gap-2">
            <Badge variant="outline">Account: {identity.awsAccountId}</Badge>
            <Badge variant="outline">Supabase-backed</Badge>
            <Badge variant="outline">Admin managed</Badge>
          </div>
        </CardContent>
      </Card>

      {errorMessage && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>}

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle>Intern profiles</CardTitle>
            <CardDescription>Select an assignment or create a new profile.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setSelectedProfileId(''); setForm(emptyForm()); }}>New profile</Button>
              <Button onClick={() => void handleSave()} disabled={isLoading} className="bg-orange-600 hover:bg-orange-700">Save to database</Button>
            </div>
            <div className="max-h-[34rem] space-y-3 overflow-auto pr-1">
              {isLoading && profiles.length === 0 && <div className="rounded-lg border border-dashed p-5 text-sm text-slate-500">Loading profiles...</div>}
              {!isLoading && profiles.length === 0 && <div className="rounded-lg border border-dashed p-5 text-sm text-slate-500">No profiles yet.</div>}
              {profiles.map((profile) => (
                <button key={profile.id} onClick={() => { setSelectedProfileId(profile.id); setForm({ ...emptyForm(), ...profile }); }} className={`w-full rounded-xl border p-4 text-left ${selectedProfileId === profile.id ? 'border-orange-500 bg-orange-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{profile.appUserName}</p>
                      <p className="truncate text-sm text-slate-600">{profile.appUserEmail}</p>
                    </div>
                    <Badge variant="outline" className="capitalize">{profile.status}</Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-slate-500">
                    <span>AWS username: {profile.awsIdentityCenterUsername || '—'}</span>
                    <span>Permission set: {profile.permissionSetName || '—'}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selectedProfileId ? 'Edit profile' : 'New profile'}</CardTitle>
            <CardDescription>Map a platform user to AWS Identity Center details.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Platform name" value={form.appUserName} onChange={(value) => setForm((prev) => ({ ...prev, appUserName: value }))} />
            <Field label="Platform email" type="email" value={form.appUserEmail} onChange={(value) => setForm((prev) => ({ ...prev, appUserEmail: value }))} />
            <Field label="AWS Identity Center username" value={form.awsIdentityCenterUsername} onChange={(value) => setForm((prev) => ({ ...prev, awsIdentityCenterUsername: value }))} />
            <Field label="AWS Identity Center email" type="email" value={form.awsIdentityCenterEmail} onChange={(value) => setForm((prev) => ({ ...prev, awsIdentityCenterEmail: value }))} />
            <Field label="Sandbox account ID" value={form.awsAccountId} onChange={(value) => setForm((prev) => ({ ...prev, awsAccountId: value }))} />
            <Field label="Permission set" value={form.permissionSetName} onChange={(value) => setForm((prev) => ({ ...prev, permissionSetName: value }))} />
            <Field label="Status" value={form.status} onChange={(value) => setForm((prev) => ({ ...prev, status: value as InternProfileStatus }))} />
            <div className="space-y-2">
              <Label htmlFor="profile-notes">Notes</Label>
              <Textarea id="profile-notes" rows={4} value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => void handleSave()} disabled={isLoading} className="bg-orange-600 hover:bg-orange-700">Save</Button>
              <Button variant="outline" onClick={() => void handleDelete()} disabled={!selectedProfileId || isLoading}>Delete</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  const id = `field-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
