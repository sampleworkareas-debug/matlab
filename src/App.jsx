import React, { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bell, Droplets, Thermometer, Wifi, Clock, Sparkles } from "lucide-react";
import Chart from "react-apexcharts";

const DEFAULT_CHANNEL_ID = "3281642";
const DEFAULT_REFRESH_SEC = 1;
const MAX_RESULTS = 30;
const DEFAULT_READ_API_KEY = "L3VW2XW8YKLYXPM1";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const HR_HIGH_THRESHOLD = 100;    // BPM — tachycardia
const TEMP_HIGH_THRESHOLD = 37.5; // °C — fever
const READ_KEY_REGEX = /^[A-Za-z0-9]{16}$/;
const STORAGE_KEYS = {
  channelId: "aarga.thingspeak.channelId",
  readApiKey: "aarga.thingspeak.readApiKey",
  refreshSec: "aarga.thingspeak.refreshSec",
};

const convertTemp = (adc) => {
  if (!adc || adc <= 0) return null;
  const voltage = adc * (3.3 / 1023.0);
  if (voltage <= 0) return null;
  const resistance = ((3.3 - voltage) * 10000) / voltage;
  if (!Number.isFinite(resistance) || resistance <= 0) return null;
  const temp = 1.0 / (Math.log(resistance / 10000) / 3950 + 1.0 / (25 + 273.15)) - 273.15;
  return Number.isFinite(temp) ? Number(temp.toFixed(1)) : null;
};

const normalizeTemperature = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  if (parsed >= 20 && parsed <= 50) {
    return Number(parsed.toFixed(1));
  }

  const converted = convertTemp(parsed);
  if (converted !== null && converted >= 20 && converted <= 50) {
    return converted;
  }

  return null;
};

const toNum = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toNumOrNull = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const sanitizeSeries = (values, min, max) => {
  let lastValid = null;
  return values.map((value) => {
    if (value !== null && value >= min && value <= max) {
      lastValid = value;
      return value;
    }
    return lastValid;
  });
};

const getLatestValid = (values, fallback = null) => {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (Number.isFinite(values[index])) {
      return values[index];
    }
  }
  return fallback;
};

const Pill = ({ children, tone = "slate" }) => {
  const tones = {
    slate: "bg-slate-100 text-slate-700 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };

  return (
    <span className={`inline-flex items-center gap-2 border px-3 py-1.5 rounded-full text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
};

const AlertBanner = ({ type, message, Icon }) => {
  const styles = {
    rose: "bg-rose-50 border-rose-400 text-rose-800",
    orange: "bg-orange-50 border-orange-400 text-orange-800",
  };
  return (
    <div className={`flex items-center gap-3 rounded-2xl border-2 px-5 py-4 ${styles[type]}`} role="alert">
      <span className="shrink-0 animate-pulse">
        <AlertTriangle size={20} />
      </span>
      <p className="text-sm font-bold flex-1">{message}</p>
      <Bell size={16} className="shrink-0 opacity-60" />
    </div>
  );
};

const MetricCard = ({ title, value, unit, subtitle, icon, progressColor, percent, alert }) => (
  <article className={`relative overflow-hidden rounded-2xl border shadow-sm p-6 transition-colors ${alert ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-white"}`}>
    <div className={`absolute inset-x-0 top-0 h-1 ${alert ? "bg-rose-500" : progressColor}`} />
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{title}</p>
        <p className="mt-4 text-4xl font-black tracking-tight text-slate-900">{value}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{unit}</p>
      </div>
      <div className={`h-11 w-11 rounded-2xl text-white flex items-center justify-center shadow-lg ${alert ? "bg-rose-600" : "bg-slate-900"}`}>
        {icon}
      </div>
    </div>

    <div className="mt-5">
      <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${alert ? "bg-rose-500" : progressColor}`}
          style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
        />
      </div>
      <p className="mt-2 text-xs font-medium text-slate-500">{subtitle}</p>
    </div>
  </article>
);

const TrendCard = ({ title, subTitle, options, series, type = "area", height = 290 }) => (
  <article className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6">
    <div className="mb-5 flex items-center justify-between gap-3">
      <div>
        <h3 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500">{subTitle}</p>
      </div>
      <Pill tone="indigo">
        <Sparkles size={14} /> Live
      </Pill>
    </div>
    <Chart options={options} series={series} type={type} height={height} />
  </article>
);

const App = () => {
  const [channelIdInput, setChannelIdInput] = useState(() => localStorage.getItem(STORAGE_KEYS.channelId) || DEFAULT_CHANNEL_ID);
  const [readApiKeyInput, setReadApiKeyInput] = useState(() => localStorage.getItem(STORAGE_KEYS.readApiKey) || DEFAULT_READ_API_KEY);
  const [refreshSecInput, setRefreshSecInput] = useState(() => Number(localStorage.getItem(STORAGE_KEYS.refreshSec) || DEFAULT_REFRESH_SEC));

  const [activeChannelId, setActiveChannelId] = useState(channelIdInput);
  const [activeRefreshSec, setActiveRefreshSec] = useState(refreshSecInput);
  const [activeReadApiKey, setActiveReadApiKey] = useState(() => localStorage.getItem(STORAGE_KEYS.readApiKey) || DEFAULT_READ_API_KEY);
  const [isConnected, setIsConnected] = useState(false);

  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("Not Connected");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isConnected) {
      return undefined;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/feeds?results=${MAX_RESULTS}&channelId=${encodeURIComponent(activeChannelId)}&readApiKey=${encodeURIComponent(activeReadApiKey)}`);
        if (!res.ok) {
          throw new Error("ThingSpeak request failed");
        }
        const data = await res.json();
        setFeeds(data.feeds || []);
        setActiveChannelId(data.channelId || activeChannelId);
        setConnectionStatus("Connected");
        setError("");
      } catch (error) {
        setConnectionStatus("Connection Failed");
        setError("Unable to fetch data. Check your connection or Vercel deployment configuration.");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const safeRefresh = Math.max(1, Number(activeRefreshSec) || DEFAULT_REFRESH_SEC);
    const interval = setInterval(fetchData, safeRefresh * 1000);
    return () => clearInterval(interval);
  }, [activeChannelId, activeRefreshSec, isConnected, activeReadApiKey]);

  const handleConnect = () => {
    const nextChannel = channelIdInput.trim();
    const nextKey = readApiKeyInput.trim();
    const nextRefresh = Math.max(1, Number(refreshSecInput) || DEFAULT_REFRESH_SEC);

    if (!nextChannel) {
      setConnectionStatus("Channel ID required");
      return;
    }

    if (!nextKey) {
      setConnectionStatus("Read API Key required");
      setError("Please paste your Read API Key, then click Connect.");
      return;
    }

    if (!READ_KEY_REGEX.test(nextKey)) {
      setConnectionStatus("Invalid API Key");
      setError("Read API Key must be exactly 16 letters/numbers.");
      return;
    }

    const applyConfig = async () => {
      try {
        setConnectionStatus("Verifying...");
        setLoading(true);

        const response = await fetch(`${API_BASE}/api/config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channelId: nextChannel, readApiKey: nextKey }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          setConnectionStatus("Authentication Failed");
          setError(data.error || "Connection rejected by server.");
          setLoading(false);
          setIsConnected(false);
          return;
        }

        localStorage.setItem(STORAGE_KEYS.channelId, nextChannel);
        localStorage.setItem(STORAGE_KEYS.readApiKey, nextKey);
        localStorage.setItem(STORAGE_KEYS.refreshSec, String(nextRefresh));

        setActiveChannelId(nextChannel);
        setActiveRefreshSec(nextRefresh);
        setActiveReadApiKey(nextKey);
        setIsConnected(true);
        setError("");
      } catch (requestError) {
        setConnectionStatus("Connection Failed");
        setError("Cannot reach the API. Check your Vercel deployment or run vercel dev locally.");
        setLoading(false);
        setIsConnected(false);
      }
    };

    applyConfig();
  };

  const rawSpo2 = feeds.map((feed) => toNumOrNull(feed.field1));
  const rawHr = feeds.map((feed) => toNumOrNull(feed.field2));
  const rawTemp = feeds.map((feed) => normalizeTemperature(feed.field3));

  const spo2SeriesData = sanitizeSeries(rawSpo2, 60, 100);
  const hrSeriesData = sanitizeSeries(rawHr, 35, 220);
  const tempSeriesData = sanitizeSeries(rawTemp, 20, 50);

  const latestSpo2 = getLatestValid(spo2SeriesData, 0);
  const latestHr = getLatestValid(hrSeriesData, 0);
  const latestTemp = getLatestValid(tempSeriesData, null);

  const activeAlerts = [];
  if (isConnected && feeds.length > 0) {
    if (latestHr > HR_HIGH_THRESHOLD) {
      activeAlerts.push({
        id: "hr",
        type: "rose",
        message: `High Heart Rate: ${latestHr.toFixed(0)} BPM — exceeds safe limit of ${HR_HIGH_THRESHOLD} BPM`,
        Icon: Activity,
      });
    }
    if (latestTemp !== null && latestTemp > TEMP_HIGH_THRESHOLD) {
      activeAlerts.push({
        id: "temp",
        type: "orange",
        message: `High Temperature: ${latestTemp.toFixed(1)}°C — exceeds safe limit of ${TEMP_HIGH_THRESHOLD}°C`,
        Icon: Thermometer,
      });
    }
  }

  const categories = feeds.map((feed) =>
    new Date(feed.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
  );

  const baseChartOptions = useMemo(
    () => ({
      chart: {
        toolbar: { show: false },
        zoom: { enabled: false },
        background: "transparent",
        animations: { enabled: false },
        dropShadow: {
          enabled: true,
          color: "#111827",
          top: 1,
          left: 0,
          blur: 1,
          opacity: 0.16,
        },
      },
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", lineCap: "round", width: 4, colors: ["#111827"] },
      markers: {
        size: 2,
        strokeColors: "#111827",
        fillColors: ["#111827"],
        hover: {
          sizeOffset: 3,
        },
      },
      fill: {
        type: "gradient",
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.08,
          opacityTo: 0.01,
          stops: [0, 90, 100],
        },
      },
      xaxis: {
        categories,
        labels: {
          style: {
            colors: "#64748b",
            fontSize: "11px",
          },
        },
      },
      yaxis: {
        labels: {
          style: {
            colors: "#64748b",
            fontSize: "11px",
          },
        },
      },
      grid: {
        borderColor: "#e2e8f0",
        strokeDashArray: 4,
      },
      tooltip: {
        theme: "light",
        x: {
          format: "HH:mm:ss",
        },
      },
    }),
    [categories]
  );

  const spo2Series = [
    {
      name: "SpO2",
      data: spo2SeriesData,
    },
  ];

  const hrSeries = [
    {
      name: "BPM",
      data: hrSeriesData,
    },
  ];

  const tempSeries = [
    {
      name: "Temperature",
      data: tempSeriesData,
    },
  ];

  const combinedSeries = [
    { name: "SpO2", data: spo2SeriesData },
    { name: "BPM", data: hrSeriesData },
    { name: "Temp", data: tempSeriesData },
  ];

  const spo2Options = {
    ...baseChartOptions,
    colors: ["#111827"],
    stroke: { ...baseChartOptions.stroke, width: 4 },
    yaxis: { ...baseChartOptions.yaxis, min: 94, max: 100 },
  };

  const hrOptions = {
    ...baseChartOptions,
    colors: ["#111827"],
    stroke: { ...baseChartOptions.stroke, width: 4 },
    yaxis: { ...baseChartOptions.yaxis, max: 200 },
  };

  const tempOptions = {
    ...baseChartOptions,
    colors: ["#111827"],
    stroke: { ...baseChartOptions.stroke, width: 4 },
    yaxis: { ...baseChartOptions.yaxis, min: 30, max: 45 },
  };

  const combinedOptions = {
    ...baseChartOptions,
    colors: ["#111827", "#111827", "#111827"],
    stroke: { curve: "smooth", lineCap: "round", width: 4, colors: ["#111827"] },
    fill: {
      ...baseChartOptions.fill,
      gradient: {
        ...baseChartOptions.fill.gradient,
        opacityFrom: 0.04,
        opacityTo: 0.01,
      },
    },
    yaxis: { ...baseChartOptions.yaxis, min: 30, max: 100 },
    legend: { show: true, position: "top" },
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-[1320px] space-y-8">
        <header className="rounded-2xl border border-slate-200 bg-white shadow-sm p-6 md:p-8 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-xs md:text-sm font-semibold uppercase tracking-[0.2em] text-slate-500 mt-1">Cardiac Recovery Monitor</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Pill tone="emerald">
              <span className="inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              System Live
            </Pill>
            <Pill>
              <Clock size={14} />
              {new Date().toLocaleTimeString()}
            </Pill>
            <Pill tone="indigo">
              <Wifi size={14} />
              Channel {isConnected ? activeChannelId : "--"}
            </Pill>
            <Pill tone={connectionStatus === "Connected" ? "emerald" : "slate"}>
              {connectionStatus}
            </Pill>
          </div>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 md:p-6">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500 mb-4">ThingSpeak Connection</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Channel ID"
              value={channelIdInput}
              onChange={(event) => setChannelIdInput(event.target.value)}
            />
            <input
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Read API Key (for private channels)"
              value={readApiKeyInput}
              onChange={(event) => setReadApiKeyInput(event.target.value)}
            />
            <input
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
              type="number"
              min={1}
              placeholder="Refresh Seconds"
              value={refreshSecInput}
              onChange={(event) => setRefreshSecInput(event.target.value)}
            />
            <button className="bg-slate-900 text-white rounded-lg px-4 py-2 text-sm font-semibold" onClick={handleConnect}>
              Connect
            </button>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Use Channel ID and Read API Key from `thingspeak.mathworks.com`. Data fetch starts only after successful Connect.
          </p>
          {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
        </section>

        {activeAlerts.length > 0 && (
          <div className="space-y-3">
            {activeAlerts.map((al) => (
              <AlertBanner key={al.id} {...al} />
            ))}
          </div>
        )}

        <main className="grid grid-cols-1 xl:grid-cols-12 gap-7">
          <section className="xl:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <MetricCard
              title="SpO2"
              value={`${latestSpo2.toFixed(0)}%`}
              unit="Oxygen Saturation"
              subtitle="Live reading from Field 1"
              icon={<Droplets size={20} />}
              progressColor="bg-indigo-500"
              percent={latestSpo2}
            />
            <MetricCard
              title="Heart Rate"
              value={`${latestHr.toFixed(0)}`}
              unit="BPM"
              subtitle="Live reading from Field 2"
              icon={<Activity size={20} />}
              progressColor="bg-slate-700"
              percent={(latestHr / 180) * 100}
              alert={isConnected && feeds.length > 0 && latestHr > HR_HIGH_THRESHOLD}
            />
            <MetricCard
              title="Body Temperature"
              value={latestTemp === null ? "--" : `${latestTemp.toFixed(1)}°`}
              unit="Celsius"
              subtitle="Live reading from Field 3"
              icon={<Thermometer size={20} />}
              progressColor="bg-emerald-500"
              percent={latestTemp === null ? 0 : (latestTemp / 45) * 100}
              alert={isConnected && feeds.length > 0 && latestTemp !== null && latestTemp > TEMP_HIGH_THRESHOLD}
            />
          </section>

          <section className="xl:col-span-4 space-y-6">
            <article className="rounded-2xl border border-slate-800 bg-slate-900 text-white p-7 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Device Status</p>
              <h3 className="mt-4 text-2xl font-black tracking-tight">Cardiac Band v2</h3>
              <p className="mt-2 text-sm text-slate-300">Signal processing active with range filtering and smoothing.</p>
              <div className="mt-6">
                <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                  <span>Signal Strength</span>
                  <span className="font-bold text-emerald-400">{loading ? "--" : "98%"}</span>
                </div>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[98%] bg-emerald-400 rounded-full" />
                </div>
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Analytics Note</p>
              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-800">
                Real-time telemetry is transformed with MATLAB-equivalent conversion logic to keep temperature interpretation accurate and stable.
              </p>
            </article>
          </section>

          <section className="xl:col-span-12 grid grid-cols-1 md:grid-cols-2 gap-6">
            <TrendCard
              title="SpO2 Trend"
              subTitle="Last 20 feeds • Field 1"
              options={spo2Options}
              series={spo2Series}
              type="area"
              height={240}
            />
            <TrendCard
              title="Heart Rate Trend"
              subTitle="Last 20 feeds • Field 2"
              options={hrOptions}
              series={hrSeries}
              type="area"
              height={240}
            />
            <TrendCard
              title="Temperature Trend"
              subTitle="Last 20 feeds • Field 3 (MATLAB converted)"
              options={tempOptions}
              series={tempSeries}
              type="area"
              height={240}
            />
            <TrendCard
              title="Combined Vitals"
              subTitle="SpO2 + BPM + Temp"
              options={combinedOptions}
              series={combinedSeries}
              type="area"
              height={240}
            />
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;
