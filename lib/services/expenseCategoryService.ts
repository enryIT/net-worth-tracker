import type {
  ExpenseCategory,
  ExpenseCategoryFormData,
  ExpenseSubCategory,
  ExpenseType,
} from '@/types/expenses';

const CATEGORY_ERROR_MESSAGE = 'Errore durante la gestione delle categorie.';

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | T | null;

  if (!response.ok) {
    throw new Error(
      payload && typeof payload === 'object' && 'error' in payload && payload.error
        ? payload.error
        : CATEGORY_ERROR_MESSAGE
    );
  }

  return payload as T;
}

function mapCategory(input: ExpenseCategory): ExpenseCategory {
  return {
    ...input,
    subCategories: input.subCategories ?? [],
    createdAt: new Date(input.createdAt as Date),
    updatedAt: new Date(input.updatedAt as Date),
  };
}

function toCategoryPayload(category: ExpenseCategory): ExpenseCategoryFormData {
  return {
    name: category.name,
    type: category.type,
    color: category.color,
    icon: category.icon,
    subCategories: category.subCategories ?? [],
  };
}

async function listCategories(): Promise<ExpenseCategory[]> {
  const response = await fetch('/api/expense-categories', {
    method: 'GET',
    credentials: 'same-origin',
  });

  const categories = await parseJsonResponse<ExpenseCategory[]>(response);
  return categories.map(mapCategory);
}

async function updateCategoryById(
  categoryId: string,
  formData: ExpenseCategoryFormData
): Promise<ExpenseCategory> {
  const response = await fetch(`/api/expense-categories/${categoryId}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(formData),
  });

  return mapCategory(await parseJsonResponse<ExpenseCategory>(response));
}

function createSubCategoryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get all expense categories for a user
 */
export async function getAllCategories(_userId: string): Promise<ExpenseCategory[]> {
  try {
    return await listCategories();
  } catch (error) {
    console.error('Error getting expense categories:', error);
    throw error;
  }
}

/**
 * Get categories by type
 */
export async function getCategoriesByType(
  _userId: string,
  type: ExpenseType
): Promise<ExpenseCategory[]> {
  try {
    const categories = await listCategories();
    return categories.filter(category => category.type === type);
  } catch (error) {
    console.error('Error getting expense categories by type:', error);
    throw error;
  }
}

/**
 * Get a category by ID
 */
export async function getCategoryById(categoryId: string): Promise<ExpenseCategory | null> {
  try {
    const categories = await listCategories();
    return categories.find(category => category.id === categoryId) ?? null;
  } catch (error) {
    console.error('Error getting expense category:', error);
    throw error;
  }
}

/**
 * Create a new expense category
 */
export async function createCategory(
  _userId: string,
  categoryData: ExpenseCategoryFormData
): Promise<string> {
  try {
    const response = await fetch('/api/expense-categories', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(categoryData),
    });

    const category = await parseJsonResponse<ExpenseCategory>(response);
    return category.id;
  } catch (error) {
    console.error('Error creating expense category:', error);
    throw error;
  }
}

/**
 * Update an expense category
 */
export async function updateCategory(
  categoryId: string,
  categoryData: ExpenseCategoryFormData,
  _userId: string
): Promise<void> {
  try {
    await updateCategoryById(categoryId, categoryData);
  } catch (error) {
    console.error('Error updating expense category:', error);
    throw error;
  }
}

/**
 * Delete an expense category
 */
export async function deleteCategory(categoryId: string): Promise<void> {
  try {
    await parseJsonResponse<{ success: boolean }>(
      await fetch(`/api/expense-categories/${categoryId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
    );
  } catch (error) {
    console.error('Error deleting expense category:', error);
    throw error;
  }
}

/**
 * Add a subcategory to a category
 */
export async function addSubCategory(categoryId: string, subCategoryName: string): Promise<void> {
  try {
    const category = await getCategoryById(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    const newSubCategory: ExpenseSubCategory = {
      id: createSubCategoryId(),
      name: subCategoryName,
    };

    await updateCategoryById(categoryId, {
      ...toCategoryPayload(category),
      subCategories: [...(category.subCategories ?? []), newSubCategory],
    });
  } catch (error) {
    console.error('Error adding subcategory:', error);
    throw error;
  }
}

/**
 * Remove a subcategory from a category
 */
export async function removeSubCategory(categoryId: string, subCategoryId: string): Promise<void> {
  try {
    const category = await getCategoryById(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    await updateCategoryById(categoryId, {
      ...toCategoryPayload(category),
      subCategories: (category.subCategories ?? []).filter(sub => sub.id !== subCategoryId),
    });
  } catch (error) {
    console.error('Error removing subcategory:', error);
    throw error;
  }
}

/**
 * Update a subcategory name
 */
export async function updateSubCategory(
  categoryId: string,
  subCategoryId: string,
  newName: string,
  _userId: string
): Promise<void> {
  try {
    const category = await getCategoryById(categoryId);
    if (!category) {
      throw new Error('Category not found');
    }

    await updateCategoryById(categoryId, {
      ...toCategoryPayload(category),
      subCategories: (category.subCategories ?? []).map(sub =>
        sub.id === subCategoryId ? { ...sub, name: newName } : sub
      ),
    });
  } catch (error) {
    console.error('Error updating subcategory:', error);
    throw error;
  }
}
