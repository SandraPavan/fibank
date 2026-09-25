import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import AppShell from './layouts/AppShell.vue';
import ComprovanteView from './views/ComprovanteView.vue';
import ErroView from './views/ErroView.vue';
import FacilitatorView from './views/FacilitatorView.vue';
import HistoricoView from './views/HistoricoView.vue';
import JoinView from './views/JoinView.vue';
import LoginView from './views/LoginView.vue';
import RelatoriosView from './views/RelatoriosView.vue';
import RevisarView from './views/RevisarView.vue';
import SenhaView from './views/SenhaView.vue';
import TransferirView from './views/TransferirView.vue';

export function createFinBankRouter(
  history: RouterHistory = createWebHistory(),
) {
  return createRouter({
    history,
    routes: [
      { path: '/', redirect: '/login' },
      { path: '/login', name: 'login', component: LoginView },
      { path: '/join/:groupSlug', name: 'join', component: JoinView },
      {
        path: '/facilitator',
        name: 'facilitator',
        component: FacilitatorView,
      },
      {
        path: '/app',
        component: AppShell,
        children: [
          { path: '', redirect: '/app/transferir' },
          { path: 'transferir', name: 't01', component: TransferirView },
          { path: 'revisar', name: 't02', component: RevisarView },
          { path: 'senha', name: 't03', component: SenhaView },
          {
            path: 'comprovante/:transactionId',
            name: 't04',
            component: ComprovanteView,
            props: true,
          },
          { path: 'erro', name: 't05', component: ErroView },
          { path: 'historico', name: 't06', component: HistoricoView },
          {
            path: 'relatorios',
            name: 'relatorios',
            component: RelatoriosView,
          },
        ],
      },
    ],
  });
}
