import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SukukForm } from '@/components/sukuk/SukukForm'

// Mock fetch
global.fetch = vi.fn()

describe('SukukForm Component', () => {
  const mockOnSuccess = vi.fn()
  const mockOnCancel = vi.fn()
  const mockAccountsResponse = {
    ok: true,
    json: async () => ({
      accounts: [
        { id: 'account-1', name: 'Sukuk Investments', currency: 'SAR' },
      ],
    }),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(global.fetch as any).mockClear()
  })

  it('renders create form with all required fields', () => {
    ;(global.fetch as any).mockResolvedValueOnce(mockAccountsResponse)
    render(
      <SukukForm
        mode="create"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    // Check for required fields
    expect(screen.getByLabelText(/Sukuk Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Account/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Principal Amount/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument()

    // Check for optional fields
    expect(screen.getByLabelText(/Category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Current Value/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/APR Yearly/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Maturity Date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Notes/i)).toBeInTheDocument()

    // Check for submit button
    expect(screen.getByRole('button', { name: /Create Sukuk/i })).toBeInTheDocument()
  })

  it('renders edit form with initial data', async () => {
    ;(global.fetch as any).mockResolvedValueOnce(mockAccountsResponse)
    const initialData = {
      id: 'sukuk-1',
      accountId: 'account-1',
      name: 'Test Sukuk',
      category: 'Corporate',
      principalAmount: 100000,
      currentValue: 105000,
      startDate: '2024-01-01T00:00:00.000Z',
      maturityDate: '2025-01-01T00:00:00.000Z',
      interestRate: 5.5,
      notes: 'Test notes',
    }

    render(
      <SukukForm
        mode="edit"
        initialData={initialData}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByDisplayValue('Test Sukuk')).toBeInTheDocument()
    await screen.findByRole('option', { name: /Sukuk Investments/i })
    expect(screen.getByLabelText(/Account/i)).toHaveValue('account-1')
    expect(screen.getByDisplayValue('100000')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Corporate')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Update Sukuk/i })).toBeInTheDocument()
  })

  it('validates required fields on submit', async () => {
    ;(global.fetch as any).mockResolvedValueOnce(mockAccountsResponse)
    render(
      <SukukForm
        mode="create"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    // Verify required fields have the required attribute
    const nameInput = screen.getByLabelText(/Sukuk Name/i)
    const accountIdInput = screen.getByLabelText(/Account/i)
    const principalInput = screen.getByLabelText(/Principal Amount/i)
    const startDateInput = screen.getByLabelText(/Start Date/i)
    
    expect(nameInput).toHaveAttribute('required')
    expect(accountIdInput).toHaveAttribute('required')
    expect(principalInput).toHaveAttribute('required')
    expect(startDateInput).toHaveAttribute('required')
  })

  it('submits form with valid data', async () => {
    const user = userEvent.setup()

    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/accounts')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            accounts: [{ id: 'account-1', name: 'Sukuk Investments', currency: 'SAR' }],
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, sukuk: { id: 'sukuk-1' } }),
      })
    })

    render(
      <SukukForm
        mode="create"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    // Fill in required fields
    await user.type(screen.getByLabelText(/Sukuk Name/i), 'Test Sukuk')
    await screen.findByRole('option', { name: /Sukuk Investments/i })
    await user.selectOptions(screen.getByLabelText(/Account/i), 'account-1')
    await user.type(screen.getByLabelText(/Principal Amount/i), '100000')
    
    const startDateInput = screen.getByLabelText(/Start Date/i)
    await user.type(startDateInput, '01/01/2024')

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /Create Sukuk/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sukuk/create',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled()
    })
  })

  it('displays error message on API failure', async () => {
    const user = userEvent.setup()

    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/accounts')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            accounts: [{ id: 'account-1', name: 'Sukuk Investments', currency: 'SAR' }],
          }),
        })
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: 'Failed to create Sukuk' }),
      })
    })

    render(
      <SukukForm
        mode="create"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    // Fill in required fields
    await user.type(screen.getByLabelText(/Sukuk Name/i), 'Test Sukuk')
    await screen.findByRole('option', { name: /Sukuk Investments/i })
    await user.selectOptions(screen.getByLabelText(/Account/i), 'account-1')
    await user.type(screen.getByLabelText(/Principal Amount/i), '100000')
    
    const startDateInput = screen.getByLabelText(/Start Date/i)
    await user.type(startDateInput, '01/01/2024')

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /Create Sukuk/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(screen.getByText(/Failed to create Sukuk/i)).toBeInTheDocument()
    })

    expect(mockOnSuccess).not.toHaveBeenCalled()
  })

  it('calls onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()

    ;(global.fetch as any).mockResolvedValueOnce(mockAccountsResponse)
    render(
      <SukukForm
        mode="create"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    const cancelButton = screen.getByRole('button', { name: /Cancel/i })
    await user.click(cancelButton)

    expect(mockOnCancel).toHaveBeenCalled()
  })

  it('validates principalAmount is a positive number', async () => {
    const user = userEvent.setup()

    ;(global.fetch as any).mockResolvedValueOnce(mockAccountsResponse)
    render(
      <SukukForm
        mode="create"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    const principalInput = screen.getByLabelText(/Principal Amount/i)
    
    // Verify the input has min="0" attribute for HTML5 validation
    expect(principalInput).toHaveAttribute('min', '0')
    expect(principalInput).toHaveAttribute('type', 'number')
  })

  it('has proper field types and constraints', async () => {
    ;(global.fetch as any).mockResolvedValueOnce(mockAccountsResponse)
    render(
      <SukukForm
        mode="create"
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    // Verify field types and constraints
    const nameInput = screen.getByLabelText(/Sukuk Name/i)
    expect(nameInput).toHaveAttribute('type', 'text')
    expect(nameInput).toHaveAttribute('required')

    const principalInput = screen.getByLabelText(/Principal Amount/i)
    expect(principalInput).toHaveAttribute('type', 'number')
    expect(principalInput).toHaveAttribute('required')
    expect(principalInput).toHaveAttribute('min', '0')

    const interestRateInput = screen.getByLabelText(/APR Yearly/i)
    expect(interestRateInput).toHaveAttribute('type', 'number')
    expect(interestRateInput).toHaveAttribute('min', '0')
    expect(interestRateInput).toHaveAttribute('max', '100')
  })

  it('submits form in edit mode with updated data', async () => {
    const user = userEvent.setup()

    const initialData = {
      id: 'sukuk-1',
      accountId: 'account-1',
      name: 'Test Sukuk',
      principalAmount: 100000,
      startDate: '2024-01-01T00:00:00.000Z',
    }

    ;(global.fetch as any).mockImplementation((url: string) => {
      if (url.includes('/api/accounts')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            accounts: [{ id: 'account-1', name: 'Sukuk Investments', currency: 'SAR' }],
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ success: true, sukuk: { id: 'sukuk-1' } }),
      })
    })

    render(
      <SukukForm
        mode="edit"
        initialData={initialData}
        onSuccess={mockOnSuccess}
        onCancel={mockOnCancel}
      />
    )

    // Wait for accounts to load
    await screen.findByRole('option', { name: /Sukuk Investments/i })

    // Change the name
    const nameInput = screen.getByDisplayValue('Test Sukuk')
    await user.clear(nameInput)
    await user.type(nameInput, 'Updated Sukuk')

    // Submit the form
    const submitButton = screen.getByRole('button', { name: /Update Sukuk/i })
    await user.click(submitButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/sukuk/sukuk-1',
        expect.objectContaining({
          method: 'PUT',
        })
      )
    })

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled()
    })
  })
})
