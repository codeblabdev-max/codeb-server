'use client';

import { useState, useEffect } from 'react';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
  permissions: {
    ssh: boolean;
    deploy: boolean;
    envManage: boolean;
    teamManage: boolean;
    serverConfig: boolean;
  };
  createdAt: string;
  active: boolean;
}

interface Role {
  description: string;
  defaultPermissions: TeamMember['permissions'];
}

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [roles, setRoles] = useState<Record<string, Role>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'developer' as 'admin' | 'developer' | 'viewer'
  });

  useEffect(() => {
    fetchTeam();
  }, []);

  async function fetchTeam() {
    try {
      setLoading(true);
      const res = await fetch('/api/team');
      const data = await res.json();

      if (data.success) {
        setMembers(data.data.members);
        setRoles(data.data.roles);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();

    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await res.json();

      if (data.success) {
        setMembers([...members, data.data]);
        setShowAddModal(false);
        setFormData({ name: '', email: '', role: 'developer' });
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleToggleActive(member: TeamMember) {
    try {
      const res = await fetch('/api/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: member.id,
          active: !member.active
        })
      });

      const data = await res.json();

      if (data.success) {
        setMembers(members.map(m =>
          m.id === member.id ? data.data : m
        ));
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleDeleteMember(member: TeamMember) {
    if (!confirm(`정말 ${member.name}을(를) 삭제하시겠습니까?`)) return;

    try {
      const res = await fetch(`/api/team?id=${member.id}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        setMembers(members.filter(m => m.id !== member.id));
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleUpdatePermission(member: TeamMember, permission: keyof TeamMember['permissions'], value: boolean) {
    // Prevent modifying admin SSH
    if (member.id === 'admin' && permission === 'ssh' && !value) {
      alert('Admin의 SSH 권한은 변경할 수 없습니다.');
      return;
    }

    try {
      const res = await fetch('/api/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: member.id,
          permissions: {
            ...member.permissions,
            [permission]: value
          }
        })
      });

      const data = await res.json();

      if (data.success) {
        setMembers(members.map(m =>
          m.id === member.id ? data.data : m
        ));
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert((err as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Team Management</h1>
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Team Management</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg flex items-center gap-2"
          >
            <span>+</span> Add Member
          </button>
        </div>

        {error && (
          <div className="bg-red-900/50 border border-red-500 rounded-lg p-4 mb-6">
            {error}
          </div>
        )}

        {/* Role Legend */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="font-semibold mb-3">Role Permissions</h2>
          <div className="grid grid-cols-3 gap-4 text-sm">
            {Object.entries(roles).map(([role, config]) => (
              <div key={role} className="bg-gray-700 rounded p-3">
                <span className={`inline-block px-2 py-1 rounded text-xs font-semibold mb-2 ${
                  role === 'admin' ? 'bg-red-600' :
                  role === 'developer' ? 'bg-blue-600' : 'bg-gray-600'
                }`}>
                  {role.toUpperCase()}
                </span>
                <p className="text-gray-400">{config.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Members Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-center">SSH</th>
                <th className="px-4 py-3 text-center">Deploy</th>
                <th className="px-4 py-3 text-center">ENV</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className={`border-t border-gray-700 ${!member.active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium">{member.name}</div>
                    <div className="text-xs text-gray-500">@{member.id}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{member.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      member.role === 'admin' ? 'bg-red-600' :
                      member.role === 'developer' ? 'bg-blue-600' : 'bg-gray-600'
                    }`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleUpdatePermission(member, 'ssh', !member.permissions.ssh)}
                      disabled={member.id === 'admin'}
                      className={`w-6 h-6 rounded ${
                        member.permissions.ssh
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-600 hover:bg-gray-500'
                      } ${member.id === 'admin' ? 'cursor-not-allowed opacity-70' : ''}`}
                    >
                      {member.permissions.ssh ? '✓' : ''}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleUpdatePermission(member, 'deploy', !member.permissions.deploy)}
                      className={`w-6 h-6 rounded ${
                        member.permissions.deploy
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      {member.permissions.deploy ? '✓' : ''}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleUpdatePermission(member, 'envManage', !member.permissions.envManage)}
                      className={`w-6 h-6 rounded ${
                        member.permissions.envManage
                          ? 'bg-green-600 hover:bg-green-700'
                          : 'bg-gray-600 hover:bg-gray-500'
                      }`}
                    >
                      {member.permissions.envManage ? '✓' : ''}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleToggleActive(member)}
                      disabled={member.id === 'admin'}
                      className={`px-2 py-1 rounded text-xs ${
                        member.active
                          ? 'bg-green-900 text-green-300'
                          : 'bg-red-900 text-red-300'
                      } ${member.id === 'admin' ? 'cursor-not-allowed' : 'hover:opacity-80'}`}
                    >
                      {member.active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {member.id !== 'admin' && (
                      <button
                        onClick={() => handleDeleteMember(member)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add Member Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">Add Team Member</h2>
              <form onSubmit={handleAddMember}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-gray-700 rounded px-3 py-2"
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-gray-700 rounded px-3 py-2"
                    required
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                    className="w-full bg-gray-700 rounded px-3 py-2"
                  >
                    <option value="developer">Developer (SSH 금지)</option>
                    <option value="viewer">Viewer (읽기 전용)</option>
                    <option value="admin">Admin (SSH 허용)</option>
                  </select>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 bg-gray-600 hover:bg-gray-500 py-2 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded"
                  >
                    Add Member
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
