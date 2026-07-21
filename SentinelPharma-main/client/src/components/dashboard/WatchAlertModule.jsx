/**
 * SentinelPharma Watch & Alert Module Component
 * ==========================================
 * Proactive molecule watchlist with background monitoring.
 * 
 * Features:
 * - Add molecules to watch list
 * - Configure alert preferences
 * - View monitoring status
 * - Email notification settings
 */

import { useState, useEffect } from 'react';
import { 
  Bell, 
  Plus, 
  X, 
  Eye, 
  Mail, 
  Clock, 
  AlertCircle,
  CheckCircle2,
  Settings,
  Trash2,
  Activity,
  FileText,
  Scale
} from 'lucide-react';

// Mock watchlist data
const MOCK_WATCHLIST = [
  {
    id: 'watch_1',
    molecule: 'Metformin',
    addedDate: '2024-11-15',
    lastChecked: '2024-12-03T10:30:00',
    status: 'active',
    alertTypes: ['new_trials', 'patent_changes'],
    recentAlerts: 2
  },
  {
    id: 'watch_2',
    molecule: 'Rapamycin',
    addedDate: '2024-11-20',
    lastChecked: '2024-12-03T08:15:00',
    status: 'active',
    alertTypes: ['new_trials', 'new_publications'],
    recentAlerts: 0
  }
];

// Mock alerts data
const MOCK_ALERTS = [
  {
    id: 'alert_1',
    molecule: 'Metformin',
    type: 'new_trial',
    title: 'New Phase 2 Trial Registered',
    description: 'NCT05123456: Metformin for Alzheimer\'s Prevention',
    timestamp: '2024-12-02T14:30:00',
    isRead: false,
    link: 'https://clinicaltrials.gov/study/NCT05123456'
  },
  {
    id: 'alert_2',
    molecule: 'Metformin',
    type: 'publication',
    title: 'New Publication in Nature Medicine',
    description: 'Metformin\'s anti-aging effects: A comprehensive review',
    timestamp: '2024-12-01T09:00:00',
    isRead: true
  }
];

const WatchAlertModule = () => {
  const [watchlist, setWatchlist] = useState(MOCK_WATCHLIST);
  const [alerts, setAlerts] = useState(MOCK_ALERTS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newMolecule, setNewMolecule] = useState('');
  const [selectedAlertTypes, setSelectedAlertTypes] = useState({
    new_trials: true,
    patent_changes: true,
    new_publications: false,
    market_updates: false
  });
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [emailFrequency, setEmailFrequency] = useState('daily');
  const [activeTab, setActiveTab] = useState('watchlist');

  const unreadAlerts = alerts.filter(a => !a.isRead).length;

  // Alert type configurations
  const alertTypeConfig = [
    { id: 'new_trials', label: 'New Clinical Trials', icon: FileText, color: 'text-blue-600' },
    { id: 'patent_changes', label: 'Patent Changes', icon: Scale, color: 'text-purple-600' },
    { id: 'new_publications', label: 'New Publications', icon: FileText, color: 'text-green-600' },
    { id: 'market_updates', label: 'Market Updates', icon: Activity, color: 'text-orange-600' },
  ];

  // Add molecule to watchlist
  const handleAddMolecule = () => {
    if (!newMolecule.trim()) return;

    const newWatch = {
      id: `watch_${Date.now()}`,
      molecule: newMolecule,
      addedDate: new Date().toISOString().split('T')[0],
      lastChecked: new Date().toISOString(),
      status: 'active',
      alertTypes: Object.entries(selectedAlertTypes)
        .filter(([_, enabled]) => enabled)
        .map(([type, _]) => type),
      recentAlerts: 0
    };

    setWatchlist(prev => [...prev, newWatch]);
    setNewMolecule('');
    setShowAddModal(false);
  };

  // Remove molecule from watchlist
  const handleRemoveMolecule = (id) => {
    setWatchlist(prev => prev.filter(w => w.id !== id));
  };

  // Mark alert as read
  const handleMarkAsRead = (alertId) => {
    setAlerts(prev => prev.map(a => 
      a.id === alertId ? { ...a, isRead: true } : a
    ));
  };

  // Mark all alerts as read
  const handleMarkAllAsRead = () => {
    setAlerts(prev => prev.map(a => ({ ...a, isRead: true })));
  };

  // Get relative time
  const getRelativeTime = (timestamp) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diff = now - date;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg dark:shadow-2xl overflow-hidden border border-gray-100 dark:border-slate-700">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-600">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <Bell className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
            Watch & Alert
            {unreadAlerts > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                {unreadAlerts}
              </span>
            )}
          </h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Watch</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-900">
        <button
          onClick={() => setActiveTab('watchlist')}
          className={`flex-1 py-3 text-sm font-medium text-center transition-colors ${
            activeTab === 'watchlist'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-white dark:bg-slate-800'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Eye className="w-4 h-4 inline mr-1" />
          Watchlist ({watchlist.length})
        </button>
        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex-1 py-3 text-sm font-medium text-center transition-colors ${
            activeTab === 'alerts'
              ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-white dark:bg-slate-800'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <AlertCircle className="w-4 h-4 inline mr-1" />
          Alerts
          {unreadAlerts > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-600 text-xs rounded-full">
              {unreadAlerts}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-80 overflow-y-auto">
        {/* Watchlist Tab */}
        {activeTab === 'watchlist' && (
          <div className="space-y-3">
            {watchlist.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Eye className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No molecules in watchlist</p>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="mt-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium"
                >
                  Add your first molecule
                </button>
              </div>
            ) : (
              watchlist.map(item => (
                <div 
                  key={item.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${
                      item.status === 'active' ? 'bg-green-500' : 'bg-gray-400'
                    }`} />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">{item.molecule}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-2">
                        <span>Added {item.addedDate}</span>
                        <span>•</span>
                        <span className="flex items-center">
                          <Clock className="w-3 h-3 mr-1" />
                          {getRelativeTime(item.lastChecked)}
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {item.recentAlerts > 0 && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">
                        {item.recentAlerts} new
                      </span>
                    )}
                    <button
                      onClick={() => handleRemoveMolecule(item.id)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                      title="Remove from watchlist"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            {alerts.length > 0 && (
              <div className="flex justify-end mb-2">
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Mark all as read
                </button>
              </div>
            )}
            
            {alerts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No alerts yet</p>
              </div>
            ) : (
              alerts.map(alert => (
                <div 
                  key={alert.id}
                  onClick={() => handleMarkAsRead(alert.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    alert.isRead 
                      ? 'bg-gray-50 hover:bg-gray-100' 
                      : 'bg-blue-50 hover:bg-blue-100 border border-blue-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className={`p-1.5 rounded-lg ${
                        alert.type === 'new_trial' ? 'bg-blue-100' :
                        alert.type === 'publication' ? 'bg-green-100' :
                        'bg-gray-100'
                      }`}>
                        {alert.type === 'new_trial' ? (
                          <FileText className="w-4 h-4 text-blue-600" />
                        ) : (
                          <FileText className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-medium text-gray-500">{alert.molecule}</span>
                          {!alert.isRead && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                        <div className="font-medium text-gray-900 text-sm mt-0.5">
                          {alert.title}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {alert.description}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {getRelativeTime(alert.timestamp)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <h4 className="font-medium text-gray-900 mb-3">Notification Settings</h4>
          
          <div className="space-y-3">
            {/* Email Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mail className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-700">Email Notifications</span>
              </div>
              <button
                onClick={() => setEmailEnabled(!emailEnabled)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  emailEnabled ? 'bg-blue-600' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                  emailEnabled ? 'translate-x-5' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* Frequency */}
            {emailEnabled && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Frequency</span>
                <select
                  value={emailFrequency}
                  onChange={(e) => setEmailFrequency(e.target.value)}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="realtime">Real-time</option>
                  <option value="daily">Daily Digest</option>
                  <option value="weekly">Weekly Summary</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add Molecule Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">Add to Watchlist</h4>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Molecule Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Molecule Name
                </label>
                <input
                  type="text"
                  value={newMolecule}
                  onChange={(e) => setNewMolecule(e.target.value)}
                  placeholder="e.g., Metformin, Aspirin"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* Alert Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Alert Types
                </label>
                <div className="space-y-2">
                  {alertTypeConfig.map(type => (
                    <label 
                      key={type.id}
                      className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAlertTypes[type.id]}
                        onChange={() => setSelectedAlertTypes(prev => ({
                          ...prev,
                          [type.id]: !prev[type.id]
                        }))}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <type.icon className={`w-4 h-4 ${type.color}`} />
                      <span className="text-sm text-gray-700">{type.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMolecule}
                disabled={!newMolecule.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add to Watchlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WatchAlertModule;
