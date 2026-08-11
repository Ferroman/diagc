// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InspectorTabs } from './InspectorTabs';

describe('InspectorTabs', () => {
  it('shows the active tab body and marks the tab selected', () => {
    render(
      <InspectorTabs
        activeTab="properties"
        onTabChange={() => {}}
        properties={<div>PROPS</div>}
        library={<div>LIB</div>}
      />,
    );
    expect(screen.getByText('PROPS')).toBeDefined();
    expect(screen.queryByText('LIB')).toBeNull();
    expect(screen.getByRole('tab', { name: 'Properties' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Library' }).getAttribute('aria-selected')).toBe('false');
  });

  it('renders the library body when active', () => {
    render(
      <InspectorTabs activeTab="library" onTabChange={() => {}} properties={<div>PROPS</div>} library={<div>LIB</div>} />,
    );
    expect(screen.getByText('LIB')).toBeDefined();
    expect(screen.queryByText('PROPS')).toBeNull();
  });

  it('fires onTabChange when a tab is clicked', () => {
    const onTabChange = vi.fn();
    render(
      <InspectorTabs activeTab="properties" onTabChange={onTabChange} properties={<div>PROPS</div>} library={<div>LIB</div>} />,
    );
    screen.getByRole('tab', { name: 'Library' }).click();
    expect(onTabChange).toHaveBeenCalledWith('library');
  });
});
