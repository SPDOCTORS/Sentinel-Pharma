/**
 * SentinelPharma Watchlist Routes
 * ==============================
 * MongoDB-backed watchlist and alert endpoints.
 */

const express = require('express');
const { logger } = require('../utils/logger');
const { requireAuth } = require('../middleware/auth');
const { WatchlistItem, Alert } = require('../models');

const router = express.Router();

const toAlertTypes = (preferences = {}) => {
  const alertTypes = [];
  if (preferences.clinicalTrials !== false) alertTypes.push('new_trials');
  if (preferences.patents !== false) alertTypes.push('patent_changes');
  if (preferences.publications !== false) alertTypes.push('new_publications');
  if (preferences.market === true) alertTypes.push('market_updates');
  return alertTypes.length ? alertTypes : ['new_trials', 'patent_changes'];
};

const toLegacyWatchlistShape = (item) => ({
  id: String(item._id),
  userId: String(item.userId),
  molecule: item.molecule,
  disease: item.baseline?.disease || null,
  alertPreferences: {
    clinicalTrials: item.alertTypes.includes('new_trials'),
    patents: item.alertTypes.includes('patent_changes'),
    publications: item.alertTypes.includes('new_publications'),
    regulatory: item.alertTypes.includes('market_updates'),
    frequency: item.checkFrequency
  },
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  lastChecked: item.lastChecked,
  alertCount: item.totalAlerts || 0,
  status: item.status
});

const ensureSeedAlerts = async (item, userId) => {
  const existing = await Alert.countDocuments({ watchlistItemId: item._id, userId });
  if (existing > 0) return;

  const alerts = [];
  if (item.alertTypes.includes('new_trials')) {
    alerts.push({
      userId,
      watchlistItemId: item._id,
      molecule: item.molecule,
      alertType: 'new_trial',
      title: `Clinical trial monitoring enabled for ${item.molecule}`,
      description: `SentinelPharma will track new trial signals for ${item.molecule}.`,
      sourceType: 'ClinicalTrials.gov',
      sourceUrl: `https://clinicaltrials.gov/search?term=${encodeURIComponent(item.molecule)}`
    });
  }
  if (item.alertTypes.includes('patent_changes')) {
    alerts.push({
      userId,
      watchlistItemId: item._id,
      molecule: item.molecule,
      alertType: 'patent_change',
      title: `Patent monitoring enabled for ${item.molecule}`,
      description: `Patent and freedom-to-operate changes will be tracked for ${item.molecule}.`,
      sourceType: 'Google Patents',
      sourceUrl: `https://patents.google.com/?q=${encodeURIComponent(item.molecule)}`
    });
  }
  if (item.alertTypes.includes('new_publications')) {
    alerts.push({
      userId,
      watchlistItemId: item._id,
      molecule: item.molecule,
      alertType: 'publication',
      title: `Publication monitoring enabled for ${item.molecule}`,
      description: `New PubMed literature signals will be tracked for ${item.molecule}.`,
      sourceType: 'PubMed',
      sourceUrl: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(item.molecule)}`
    });
  }

  if (alerts.length) {
    await Alert.insertMany(alerts);
    item.totalAlerts = (item.totalAlerts || 0) + alerts.length;
    item.recentAlerts = (item.recentAlerts || 0) + alerts.length;
    await item.save();
  }
};

router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  logger.info('Fetching watchlist', { userId });

  const items = await WatchlistItem.find({ userId, status: { $ne: 'deleted' } })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    success: true,
    data: items.map(toLegacyWatchlistShape),
    count: items.length,
    storage: 'mongodb'
  });
});

router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { molecule, disease, alertPreferences = {} } = req.body;

  if (!molecule || !String(molecule).trim()) {
    return res.status(400).json({ success: false, error: 'Molecule name is required' });
  }

  try {
    const item = await WatchlistItem.create({
      userId,
      molecule: String(molecule).trim(),
      alertTypes: toAlertTypes(alertPreferences),
      checkFrequency: alertPreferences.frequency || 'daily',
      baseline: {
        disease: disease || null,
        lastUpdate: new Date()
      },
      nextCheckScheduled: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });

    await ensureSeedAlerts(item, userId);
    logger.info('Added to watchlist', { userId, molecule: item.molecule, itemId: item._id });

    res.status(201).json({
      success: true,
      data: toLegacyWatchlistShape(item),
      storage: 'mongodb'
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, error: 'Molecule already in watchlist' });
    }
    throw error;
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const item = await WatchlistItem.findOneAndUpdate(
    { _id: req.params.id, userId },
    { status: 'deleted', updatedAt: new Date() },
    { new: true }
  );

  if (!item) {
    return res.status(404).json({ success: false, error: 'Watchlist item not found' });
  }

  logger.info('Removed from watchlist', { userId, itemId: req.params.id, molecule: item.molecule });
  res.json({ success: true, message: 'Item removed from watchlist' });
});

router.put('/:id', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { alertPreferences, disease } = req.body;

  const update = { updatedAt: new Date() };
  if (alertPreferences) {
    update.alertTypes = toAlertTypes(alertPreferences);
    update.checkFrequency = alertPreferences.frequency || 'daily';
  }
  if (disease !== undefined) {
    update['baseline.disease'] = disease;
    update['baseline.lastUpdate'] = new Date();
  }

  const item = await WatchlistItem.findOneAndUpdate(
    { _id: req.params.id, userId, status: { $ne: 'deleted' } },
    update,
    { new: true }
  );

  if (!item) {
    return res.status(404).json({ success: false, error: 'Watchlist item not found' });
  }

  await ensureSeedAlerts(item, userId);
  logger.info('Updated watchlist item', { userId, itemId: req.params.id });

  res.json({
    success: true,
    data: toLegacyWatchlistShape(item),
    storage: 'mongodb'
  });
});

router.get('/alerts', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const alerts = await Alert.find({ userId, isArchived: false })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  res.json({
    success: true,
    data: alerts.map((alert) => ({
      id: String(alert._id),
      watchlistItemId: String(alert.watchlistItemId),
      molecule: alert.molecule,
      type: alert.alertType,
      title: alert.title,
      description: alert.description,
      source: alert.sourceType,
      sourceUrl: alert.sourceUrl,
      createdAt: alert.createdAt,
      read: alert.isRead
    })),
    count: alerts.length,
    storage: 'mongodb'
  });
});

router.post('/alerts/:id/read', requireAuth, async (req, res) => {
  const alert = await Alert.findOneAndUpdate(
    { _id: req.params.id, userId: req.user.id },
    { isRead: true },
    { new: true }
  );

  if (!alert) {
    return res.status(404).json({ success: false, error: 'Alert not found' });
  }

  res.json({ success: true, message: 'Alert marked as read', storage: 'mongodb' });
});

module.exports = router;
