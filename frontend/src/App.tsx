import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from '@/components/Layout';
import DashboardPage from '@/pages/DashboardPage';
import MapPage from '@/pages/MapPage';
import IceForecastPage from '@/pages/IceForecastPage';
import IcebergPage from '@/pages/IcebergPage';
import WeatherOceanPage from '@/pages/WeatherOceanPage';
import RoutePlannerPage from '@/pages/RoutePlannerPage';
import RiskPage from '@/pages/RiskPage';
import DataManagementPage from '@/pages/DataManagementPage';
import ModelPerformancePage from '@/pages/ModelPerformancePage';
import SettingsPage from '@/pages/SettingsPage';

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/sea-ice" element={<IceForecastPage />} />
        <Route path="/icebergs" element={<IcebergPage />} />
        <Route path="/weather-ocean" element={<WeatherOceanPage />} />
        <Route path="/route" element={<RoutePlannerPage />} />
        <Route path="/risk" element={<RiskPage />} />
        <Route path="/data" element={<DataManagementPage />} />
        <Route path="/model-performance" element={<ModelPerformancePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}

export default App;
