import { Routes, Route, Navigate } from 'react-router-dom';
import { useVersionCheck } from './hooks/useVersionCheck';
import AdminLayout        from './pages/admin/AdminLayout';
import AdminLogin         from './pages/admin/AdminLogin';
import AdminResetPassword from './pages/admin/AdminResetPassword';
import AdminDashboard     from './pages/admin/AdminDashboard';
import AdminProductForm   from './pages/admin/AdminProductForm';
import AdminUsers         from './pages/admin/AdminUsers';
import AdminHistory       from './pages/admin/AdminHistory';
import AdminSalesChart    from './pages/admin/AdminSalesChart';
import AdminSetSalesChart from './pages/admin/AdminSetSalesChart';
import AdminAgentSales    from './pages/admin/AdminAgentSales';
import AdminProductView   from './pages/admin/AdminProductView';
import AdminSets          from './pages/admin/AdminSets';
import AdminFrontmen      from './pages/admin/AdminFrontmen';
import AdminSuppliers     from './pages/admin/AdminSuppliers';
import AdminOutOfStock    from './pages/admin/AdminOutOfStock';
import AdminBufferStock   from './pages/admin/AdminBufferStock';
import AdminTechRequests     from './pages/admin/AdminTechRequests';
import AdminTechRequestForm  from './pages/admin/AdminTechRequestForm';
import AdminTechRequestDetail from './pages/admin/AdminTechRequestDetail';
import AdminAllCatalog    from './pages/admin/AdminAllCatalog';
import AdminNews         from './pages/admin/AdminNews';
import AdminNewsCreate   from './pages/admin/AdminNewsCreate';
import AdminTelegramPost from './pages/admin/AdminTelegramPost';
import AdminTelegramQueue from './pages/admin/AdminTelegramQueue';
import AdminPublish         from './pages/admin/AdminPublish';
import AdminPublishFlow     from './pages/admin/AdminPublishFlow';
import AdminPublishAccounts from './pages/admin/AdminPublishAccounts';
import AdminPublishHistory  from './pages/admin/AdminPublishHistory';
import AdminProductReview from './pages/admin/AdminProductReview';
import AdminReviewResults from './pages/admin/AdminReviewResults';
import AdminReviewVotes   from './pages/admin/AdminReviewVotes';
import AdminReceiveAlerts from './pages/admin/AdminReceiveAlerts';
import AdminPendingReceive from './pages/admin/AdminPendingReceive';
import AdminVideoSchedule from './pages/admin/AdminVideoSchedule';
import AdminVideoReport from './pages/admin/AdminVideoReport';
import AdminVideoReportDetail from './pages/admin/AdminVideoReportDetail';

// Публичная витрина отключена — приложение работает только как админка (Product Matrix).
export default function App() {
  useVersionCheck();

  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/reset-password/:token" element={<AdminResetPassword />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="products/new" element={<AdminProductForm />} />
        <Route path="products/:id" element={<AdminProductView />} />
        <Route path="products/:id/edit" element={<AdminProductForm />} />
        <Route path="sets" element={<AdminSets />} />
        <Route path="frontmen" element={<AdminFrontmen />} />
        <Route path="suppliers" element={<AdminSuppliers />} />
        <Route path="out-of-stock" element={<AdminOutOfStock />} />
        <Route path="buffer-stock" element={<AdminBufferStock />} />
        <Route path="tech-requests"     element={<AdminTechRequests />} />
        <Route path="tech-requests/new" element={<AdminTechRequestForm />} />
        <Route path="tech-requests/:id" element={<AdminTechRequestDetail />} />
        <Route path="all-catalog"  element={<AdminAllCatalog />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="history" element={<AdminHistory />} />
        <Route path="sales-chart"           element={<AdminSalesChart />} />
        <Route path="sales-chart/:setSlug" element={<AdminSetSalesChart />} />
        <Route path="agent-sales"           element={<AdminAgentSales />} />
        <Route path="news" element={<AdminNews />} />
        <Route path="news/create" element={<AdminNewsCreate />} />
        <Route path="telegram-post" element={<AdminTelegramPost />} />
        <Route path="telegram-queue" element={<AdminTelegramQueue />} />
        <Route path="publish"           element={<AdminPublish />} />
        <Route path="publish/flow"      element={<AdminPublishFlow />} />
        <Route path="publish/accounts"  element={<AdminPublishAccounts />} />
        <Route path="publish/history"   element={<AdminPublishHistory />} />
        <Route path="review" element={<AdminProductReview />} />
        <Route path="review/results" element={<AdminReviewResults />} />
        <Route path="review/votes" element={<AdminReviewVotes />} />
        <Route path="receive-alerts" element={<AdminReceiveAlerts />} />
        <Route path="pending-receive" element={<AdminPendingReceive />} />
        <Route path="video-schedule" element={<AdminVideoSchedule />} />
        <Route path="video-report" element={<AdminVideoReport />} />
        <Route path="video-report/:frontmanId" element={<AdminVideoReportDetail />} />
      </Route>
      {/* Любой другой путь ведёт в админку */}
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
