<script setup lang="ts">
interface NavItem {
  readonly to: { readonly name: string };
  readonly label: string;
}

const navItems: readonly NavItem[] = [
  { to: { name: 't01' }, label: 'Transferir' },
  { to: { name: 't06' }, label: 'Histórico' },
];
</script>

<template>
  <div class="app-shell">
    <nav class="app-shell__sidebar" aria-label="Navegação principal">
      <p class="app-shell__brand">FinBank</p>
      <ul class="app-shell__nav-list">
        <li v-for="item in navItems" :key="item.label">
          <RouterLink class="app-shell__nav-link" :to="item.to">
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>
    <main class="app-shell__content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100%;
}

.app-shell__sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  background-color: var(--color-primary);
  color: var(--color-text-on-primary);
  padding: var(--spacing-lg);
}

.app-shell__brand {
  font-size: var(--font-headline-sm-size);
  font-weight: 700;
  color: var(--color-on-primary);
  margin-bottom: var(--spacing-xl);
}

.app-shell__nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.app-shell__nav-link {
  display: block;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-input);
  color: var(--color-text-on-primary);
  text-decoration: none;
  font-size: var(--font-body-md-size);
}

.app-shell__nav-link:hover {
  background-color: rgb(255 255 255 / 10%);
}

.app-shell__nav-link.router-link-active {
  background-color: rgb(255 255 255 / 10%);
  box-shadow: inset 3px 0 0 var(--color-success);
}

.app-shell__content {
  flex: 1;
  padding: var(--spacing-gutter);
  max-width: var(--container-max);
}

@media (max-width: 768px) {
  .app-shell {
    flex-direction: column;
  }

  .app-shell__sidebar {
    width: 100%;
    padding: var(--spacing-mobile-margin);
  }

  .app-shell__nav-list {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .app-shell__content {
    padding: var(--spacing-mobile-margin);
  }
}
</style>
