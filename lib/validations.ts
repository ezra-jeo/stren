import { z } from 'zod'

const phoneRegex = /^\+?[0-9]{10,15}$/

// -- Admin auth ------------------------------------------------
export const adminLoginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const adminSignUpSchema = z.object({
  gymName: z.string().min(2, 'Gym name must be at least 2 characters').max(100),
  gymAddress: z.string().max(200).optional(),
  gymPhone: z
    .string()
    .regex(phoneRegex, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

// -- Member auth -----------------------------------------------
export const memberSignUpSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

// -- Member profile --------------------------------------------
// contact_number is the correct column name per database.types.ts
export const profileEditSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  contact_number: z
    .string()
    .regex(phoneRegex, 'Enter a valid phone number')
    .optional()
    .or(z.literal('')),
})

// -- Admin forms -----------------------------------------------
// DB table is membership_plans
export const planSchema = z.object({
  name: z.string().min(1, 'Plan name is required').max(100),
  price: z.coerce.number().min(0, 'Price must be 0 or more'),
  duration_days: z.coerce.number().int().min(1, 'Duration must be at least 1 day'),
  description: z.string().max(500).optional(),
  benefits: z.string().max(1000).optional(),
})

// Matches actual promos table columns per database.types.ts
export const promoSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  discount_type: z.string().min(1, 'Discount type is required'),
  discount_value: z.coerce.number().min(0, 'Value must be 0 or more'),
  description: z.string().max(500).optional(),
  valid_from: z.string().optional().or(z.literal('')),
  valid_until: z.string().optional().or(z.literal('')),
})

export const announcementSchema = z.object({
  title: z.string().min(1, 'Title is required').max(150),
  body: z.string().min(1, 'Body is required').max(2000),
})
