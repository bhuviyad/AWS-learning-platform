import { useEffect, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { deleteInternProfile, ensureInternProfileForUser, identityForLabSession, listInternProfiles, upsertInternProfile, type AppUserIdentity, type InternProfile, type InternProfileStatus } from '../lib/internProfiles';

interface InternsPageProps {
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

export default function InternsPage({ currentUser }: InternsPageProps) {
  const [profiles, setProfiles] = useState<InternProfile[]>(() => listInternProfiles());
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [form, setForm] = useState(emptyForm(currentUser));

  useEffect(() => {
    const ensured = ensureInternProfileForUser(currentUser);
    setProfiles(listInternProfiles());
    setSelectedProfileId((current) => current || ensured.id);
    setForm({
      ...emptyForm(currentUser),
      ...ensured,
    });
  }, [currentUser]);

  useEffect(() => {
    const activeProfiles = listInternProfiles();
    setProfiles(activeProfiles);
    if (!selectedProfileId && activeProfiles.length > 0) {
      setSelectedProfileId(activeProfiles[0].id);
      setForm({ ...emptyForm(currentUser), ...activeProfiles[0] });
    }
  }, [selectedProfileId, currentUser]);

  const loadProfile = (profile: InternProfile) => {
    setSelectedProfileId(profile.id);
    setForm({ ...emptyForm(currentUser), ...profile });
  };

  const handleSave = () => {
    const saved = upsertInternProfile({
      ...form,
      appUserId: form.appUserId || currentUser.id,
      appUserName: form.appUserName || currentUser.name,
      appUserEmail: form.appUserEmail || currentUser.email,
    });
    const next = listInternProfiles();
    setProfiles(next);
    setSelectedProfileId(saved.id);
    setForm({ ...saved });
  };

  const handleNew = () => {
    const draft = emptyForm(currentUser);
    setSelectedProfileId('');
    setForm(draft);
  };

  const handleDelete = () => {
    if (!selectedProfileId) return;
    deleteInternProfile(selectedProfileId);
    const next = listInternProfiles();
    setProfiles(next);
    const fallback = next[0] || null;
    setSelectedProfileId(fallback?.id || '');
    setForm(fallback ? { ...fallback } : emptyForm(currentUser));
  };

  const sessionIdentity = identityForLabSession(currentUser);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Intern identity mapping</CardTitle>
          <CardDescription>
            Assign AWS Identity Center details to each intern in the shared sandbox account.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">Current user:</span>
              <span>{currentUser.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">Email:</span>
              <span>{currentUser.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">Assigned AWS username:</span>
              <span>{sessionIdentity.awsIdentityCenterUsername || '—'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-slate-900">Permission set:</span>
              <span>{sessionIdentity.permissionSetName || '—'}</span>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Account: {sessionIdentity.awsAccountId}</Badge>
              <Badge variant="outline">Shared sandbox</Badge>
              <Badge variant="outline">Browser only</Badge>
            </div>
            <p className="text-sm text-slate-600">
              Use this page to keep each intern mapped to the correct AWS identity-center username, email, and permission set.
              These profiles are stored in this browser only, so other interns will not see them unless you later add a shared backend.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>Intern profiles</CardTitle>
            <CardDescription>
              Select an existing intern profile or create a new assignment.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button onClick={handleNew} variant="outline">New profile</Button>
              <Button onClick={handleSave} className="bg-orange-600 hover:bg-orange-700">Save to this browser</Button>
            </div>

            <div className="space-y-3 max-h-[480px] overflow-auto pr-1">
              {profiles.length === 0 && (
                <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                  No intern profiles yet. Create one to assign AWS identity details.
                </div>
              )}

              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  onClick={() => loadProfile(profile)}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${selectedProfileId === profile.id ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h4 className="font-semibold text-slate-900">{profile.appUserName}</h4>
                      <p className="text-sm text-slate-600">{profile.appUserEmail}</p>
                    </div>
                    <Badge variant="outline">{profile.status}</Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-slate-500">
                    <div>AWS username: {profile.awsIdentityCenterUsername || '—'}</div>
                    <div>AWS email: {profile.awsIdentityCenterEmail || '—'}</div>
                    <div>Permission set: {profile.permissionSetName || '—'}</div>
                    <div>Account: {profile.awsAccountId || '—'}</div>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Edit profile</CardTitle>
            <CardDescription>
              Map the platform user to their AWS Identity Center details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Platform name</Label>
              <Input id="profile-name" value={form.appUserName} onChange={(e) => setForm((prev) => ({ ...prev, appUserName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Platform email</Label>
              <Input id="profile-email" type="email" value={form.appUserEmail} onChange={(e) => setForm((prev) => ({ ...prev, appUserEmail: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="identity-username">AWS Identity Center username</Label>
              <Input id="identity-username" value={form.awsIdentityCenterUsername} onChange={(e) => setForm((prev) => ({ ...prev, awsIdentityCenterUsername: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="identity-email">AWS Identity Center email</Label>
              <Input id="identity-email" type="email" value={form.awsIdentityCenterEmail} onChange={(e) => setForm((prev) => ({ ...prev, awsIdentityCenterEmail: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-id">Sandbox account ID</Label>
              <Input id="account-id" value={form.awsAccountId} onChange={(e) => setForm((prev) => ({ ...prev, awsAccountId: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="permission-set">Permission set</Label>
              <Input id="permission-set" value={form.permissionSetName} onChange={(e) => setForm((prev) => ({ ...prev, permissionSetName: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Input id="status" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as InternProfileStatus }))} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} rows={4} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} className="bg-orange-600 hover:bg-orange-700">Save locally</Button>
              <Button onClick={handleDelete} variant="outline" disabled={!selectedProfileId}>Delete</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
