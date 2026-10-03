import { createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messages } from '../i18n/messages';
import { routeTree } from '../routeTree';

describe('index route', () => {
  it('renders the product name from the message catalogue', async () => {
    const router = createRouter({ routeTree });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: messages.appName })).toBeInTheDocument();
  });
});
