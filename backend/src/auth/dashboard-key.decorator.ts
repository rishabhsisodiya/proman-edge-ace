import { SetMetadata } from '@nestjs/common';
import { DashboardKey } from '../dashboards/dashboard-access/dashboard-registry';

export const DASHBOARD_KEY = 'dashboardKey';
export const DashboardKeyMeta = (key: DashboardKey) => SetMetadata(DASHBOARD_KEY, key);
