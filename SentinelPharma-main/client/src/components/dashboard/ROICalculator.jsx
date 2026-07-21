// ROICalculator.jsx
import React from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  Target,
  Clock,
  Award,
  AlertTriangle
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

const ROICalculator = ({ data, molecule }) => {
  const { isDark } = useTheme(); // reads global theme
  if (!data) return null;

  // ========== ORIGINAL LOGIC (unchanged) ==========
  const getMarketSize = () => {
    if (typeof data.market_size === 'object') {
      return data.market_size.total_market_usd_bn || data.global_market_size_usd_bn || 4.2;
    }
    return data.global_market_size_usd_bn || data.market_size || 4.2;
  };
  
  const getCAGR = () => {
    if (typeof data.cagr_analysis === 'object') {
      return data.cagr_analysis.five_year_cagr || data.five_year_cagr || '8.5%';
    }
    return data.five_year_cagr || '8.5%';
  };
  
  const getCompetitiveIntensity = () => {
    if (typeof data.competitive_landscape === 'object') {
      return data.competitive_landscape.competitive_intensity || data.competitive_landscape.concentration || 'High';
    }
    return data.competitive_landscape || 'High';
  };
  
  const marketSizeNum = getMarketSize();
  const projectedRevenue = Math.round(marketSizeNum * 1000 * 0.05); // 5% market capture assumption
  const developmentCost = data.investment_metrics?.time_to_peak_sales_years ? 
    Math.round(data.investment_metrics.time_to_peak_sales_years * 50) : 250;
  const roiPercentage = Math.round(((projectedRevenue - developmentCost) / developmentCost) * 100);
  const timeToMarket = data.investment_metrics?.time_to_peak_sales_years || 5;
  
  const getRecommendation = () => {
    if (roiPercentage > 200) return 'STRONG_BUY';
    if (roiPercentage > 100) return 'BUY';
    if (roiPercentage > 50) return 'HOLD';
    return 'REVIEW';
  };
  // ========== END ORIGINAL LOGIC ==========

  // readable recommendation style (dark, visible)
  const getRecommendationStyle = (recommendation) => {
    switch (recommendation) {
      case 'STRONG_BUY':
        return {
          bg: isDark ? 'bg-emerald-900/20' : 'bg-green-100/40',
          text: 'text-emerald-900',
          neon: 'shadow-neon-emerald',
          icon: TrendingUp,
          label: 'Strong Buy',
          pop: true
        };
      case 'BUY':
        return {
          bg: isDark ? 'bg-emerald-900/12' : 'bg-emerald-100/40',
          text: 'text-emerald-900',
          neon: 'shadow-neon-emerald',
          icon: TrendingUp,
          label: 'Buy',
          pop: true
        };
      case 'HOLD':
        return {
          bg: isDark ? 'bg-yellow-900/12' : 'bg-yellow-100/40',
          text: 'text-yellow-900',
          neon: 'shadow-neon-yellow',
          icon: Target,
          label: 'Hold',
          pop: true
        };
      default:
        return {
          bg: isDark ? 'bg-orange-900/12' : 'bg-orange-100/40',
          text: 'text-orange-900',
          neon: 'shadow-neon-orange',
          icon: AlertTriangle,
          label: 'Review',
          pop: false
        };
    }
  };

  const recStyle = getRecommendationStyle(data.recommendation || getRecommendation());
  const RecIcon = recStyle.icon;

  // Theme palette (soft neon dark / comfortable light)
  const theme = {
    cardBg: isDark ? 'bg-[#0f1115]/90 border border-white/6' : 'bg-white/95 border border-gray-100',
    textPrimary: isDark ? 'text-slate-100' : 'text-slate-900',
    textSecondary: isDark ? 'text-slate-300' : 'text-slate-600',
    metricBg: isDark ? 'bg-[#0f1418]/70 border border-white/6' : 'bg-white border border-gray-100',
    thesisBg: isDark ? 'bg-[#0f1115]/75 border border-white/6' : 'bg-gray-50 border border-gray-100',
    ambient: isDark ? 'opacity-30' : 'opacity-25'
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value * 1000000);
  };

  return (
    <div className="relative">
      {/* ambient radial glow */}
      <div className={`absolute inset-0 -z-10 flex items-center justify-center pointer-events-none ${theme.ambient}`}>
        <div
          aria-hidden
          className="w-[86%] h-[60%] rounded-3xl blur-[36px]"
          style={{
            background: isDark
              ? 'radial-gradient(closest-side, rgba(124,58,237,0.22), rgba(99,102,241,0.07), transparent 40%)'
              : 'radial-gradient(closest-side, rgba(124,58,237,0.12), rgba(99,102,241,0.04), transparent 50%)'
          }}
        />
      </div>

      <div
        className={`${theme.cardBg} rounded-2xl shadow-2xl overflow-hidden transition-transform duration-300`}
        style={{ transitionTimingFunction: 'cubic-bezier(.2,.9,.2,1)' }}
      >
        {/* top neon ribbon */}
        <div className="absolute -top-6 left-0 w-full h-6 pointer-events-none opacity-60" style={{
          background: 'linear-gradient(90deg,#7c3aed,#a78bfa,#60a5fa)',
          filter: 'blur(18px)',
          transform: 'translateY(-6px)'
        }} />

        <div className="px-6 pt-6 pb-4 flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center text-white font-bold" style={{ background: 'linear-gradient(90deg,#7c3aed,#6d28d9)' }}>
              ROI
            </div>
            <div>
              <h3 className={`text-xl font-semibold ${theme.textPrimary}`}>ROI Analysis — <span className="text-sm font-medium text-slate-500">{molecule}</span></h3>
              <p className={`text-xs ${theme.textSecondary} mt-1`}>Market Agent Financial Projections</p>
            </div>
          </div>

          {/* Recommendation badge */}
          <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl ${recStyle.bg} ${recStyle.neon} ${recStyle.pop ? 'animate-pop-fast' : ''}`} style={{ boxShadow: isDark ? '0 8px 30px rgba(124,58,237,0.10)' : '0 6px 28px rgba(124,58,237,0.06)' }}>
            <RecIcon className={`w-5 h-5 ${recStyle.text}`} />
            <div className="flex flex-col">
              <span className={`${recStyle.text} font-semibold text-sm`}>{recStyle.label}</span>
              <span className={`text-xs ${theme.textSecondary}`}>Recommendation</span>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* projected revenue */}
            <div>
              <div className={`p-4 rounded-xl ${theme.metricBg} hover:shadow-lg transition-shadow duration-200`}>
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br from-green-100 to-green-50">
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-green-700">{projectedRevenue}M</div>
                    <div className="text-xs text-green-600">Projected Revenue</div>
                  </div>
                </div>
              </div>
            </div>

            {/* development cost */}
            <div>
              <div className={`p-4 rounded-xl ${theme.metricBg} hover:shadow-lg transition-shadow duration-200`}>
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br from-red-100 to-red-50">
                    <TrendingDown className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-red-700">{developmentCost}M</div>
                    <div className="text-xs text-red-600">Development Cost</div>
                  </div>
                </div>
              </div>
            </div>

            {/* roi */}
            <div>
              <div className={`p-4 rounded-xl ${theme.metricBg} hover:shadow-lg transition-shadow duration-200`}>
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br from-blue-100 to-blue-50">
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-700">{roiPercentage}%</div>
                    <div className="text-xs text-blue-600">Return on Investment</div>
                  </div>
                </div>
              </div>
            </div>

            {/* time to market */}
            <div>
              <div className={`p-4 rounded-xl ${theme.metricBg} hover:shadow-lg transition-shadow duration-200`}>
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-gradient-to-br from-purple-100 to-purple-50">
                    <Clock className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-purple-700">{timeToMarket} yrs</div>
                    <div className="text-xs text-purple-600">Time to Market</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid md:grid-cols-3 gap-4">
            <div className={`p-3 rounded-lg ${theme.thesisBg} flex items-center justify-between`}><span className={`text-xs ${theme.textSecondary}`}>Market Size</span><span className="font-semibold text-slate-800">{marketSizeNum.toFixed(1)}B</span></div>
            <div className={`p-3 rounded-lg ${theme.thesisBg} flex items-center justify-between`}><span className={`text-xs ${theme.textSecondary}`}>5Y CAGR</span><span className="font-semibold text-slate-800">{getCAGR()}</span></div>
            <div className={`p-3 rounded-lg ${theme.thesisBg} flex items-center justify-between`}><span className={`text-xs ${theme.textSecondary}`}>Competition</span><span className="font-semibold text-slate-800">{getCompetitiveIntensity()}</span></div>
          </div>

          <div className="mt-6 p-4 rounded-xl bg-white/5 border border-white/4 shadow-sm relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ background: 'linear-gradient(180deg,#a78bfa,#7c3aed)' }} />
            <div className="pl-4">
              <h4 className={`font-semibold ${theme.textPrimary} flex items-center gap-2`}><Award className="w-4 h-4 text-yellow-400" />Investment Thesis</h4>
              <p className={`text-sm ${theme.textSecondary} mt-2 leading-relaxed`}>
                {data.investment_thesis || `Based on market analysis, ${molecule} shows ${roiPercentage > 100 ? 'strong' : 'moderate'} repurposing potential with a projected ROI of ${roiPercentage}%. The ${getCompetitiveIntensity().toLowerCase()} competitive landscape and ${getCAGR()} CAGR suggest ${roiPercentage > 150 ? 'favorable' : 'manageable'} market conditions for entry.`}
              </p>
            </div>
          </div>

          <div className="px-6 pb-6 flex items-center justify-between">
            <div className={`text-xs ${theme.textSecondary}`}>
              <span className="font-medium text-slate-800">Projected revenue (formatted):</span>{' '}
              <span className="text-slate-700">{formatCurrency(projectedRevenue)}</span>
            </div>

            <div className="flex items-center gap-3">
              <button className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-sm shadow-md hover:brightness-105 transition">Export Summary</button>
              <div className="text-xs text-slate-400">Last updated: <span className="text-slate-600 font-medium">{data.last_update || 'Unknown'}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ROICalculator;
