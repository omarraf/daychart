import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Schedule, TimeBlock, ScheduleTemplate } from '../types/schedule';

const SCHEDULES_COLLECTION = 'schedules';
const TEMPLATES_COLLECTION = 'schedule_templates';

// Helper to convert Firestore timestamp to Date
const timestampToDate = (timestamp: Timestamp | undefined): Date => {
  return timestamp ? timestamp.toDate() : new Date();
};

/**
 * Save a new schedule
 */
export const saveSchedule = async (
  userId: string,
  scheduleData: {
    name: string;
    description?: string;
    timeBlocks: TimeBlock[];
    isDefault?: boolean;
    isTemplate?: boolean;
    tags?: string[];
  }
): Promise<string> => {
  try {
    // Check schedule count limit (max 10 schedules per user)
    const schedulesQuery = query(
      collection(db, SCHEDULES_COLLECTION),
      where('userId', '==', userId),
      where('isTemplate', '==', false)
    );
    const snapshot = await getDocs(schedulesQuery);

    if (snapshot.size >= 10) {
      throw new Error('Maximum 10 schedules per user. Delete old schedules to create new ones.');
    }

    const scheduleRef = doc(collection(db, SCHEDULES_COLLECTION));
    const scheduleId = scheduleRef.id;

    await setDoc(scheduleRef, {
      ...scheduleData,
      userId,
      isDefault: scheduleData.isDefault || false,
      isTemplate: scheduleData.isTemplate || false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return scheduleId;
  } catch (error) {
    console.error('Error saving schedule:', error);
    // Re-throw if it's our custom limit error, otherwise throw generic error
    if (error instanceof Error && error.message.includes('Maximum 10 schedules')) {
      throw error;
    }
    throw new Error('Failed to save schedule');
  }
};

/**
 * Update an existing schedule
 */
export const updateSchedule = async (
  scheduleId: string,
  userId: string,
  updates: Partial<{
    name: string;
    description: string;
    timeBlocks: TimeBlock[];
    isDefault: boolean;
    tags: string[];
  }>
): Promise<void> => {
  try {
    const scheduleRef = doc(db, SCHEDULES_COLLECTION, scheduleId);
    const scheduleDoc = await getDoc(scheduleRef);

    if (!scheduleDoc.exists()) {
      throw new Error('Schedule not found');
    }

    if (scheduleDoc.data().userId !== userId) {
      throw new Error('Unauthorized');
    }

    await updateDoc(scheduleRef, {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating schedule:', error);
    throw new Error('Failed to update schedule');
  }
};

/**
 * Get a single schedule by ID
 */
export const getSchedule = async (
  scheduleId: string,
  userId: string
): Promise<Schedule | null> => {
  try {
    const scheduleRef = doc(db, SCHEDULES_COLLECTION, scheduleId);
    const scheduleDoc = await getDoc(scheduleRef);

    if (!scheduleDoc.exists()) {
      return null;
    }

    const data = scheduleDoc.data();

    if (data.userId !== userId) {
      throw new Error('Unauthorized');
    }

    return {
      id: scheduleDoc.id,
      name: data.name,
      description: data.description,
      timeBlocks: data.timeBlocks,
      userId: data.userId,
      isDefault: data.isDefault || false,
      isTemplate: data.isTemplate || false,
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt),
      tags: data.tags || [],
    };
  } catch (error) {
    console.error('Error getting schedule:', error);
    throw new Error('Failed to get schedule');
  }
};

/**
 * Get all schedules for a user
 */
export const getUserSchedules = async (userId: string): Promise<Schedule[]> => {
  try {
    const schedulesQuery = query(
      collection(db, SCHEDULES_COLLECTION),
      where('userId', '==', userId),
      where('isTemplate', '==', false)
    );

    const querySnapshot = await getDocs(schedulesQuery);
    const schedules: Schedule[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      schedules.push({
        id: doc.id,
        name: data.name,
        description: data.description,
        timeBlocks: data.timeBlocks,
        userId: data.userId,
        isDefault: data.isDefault || false,
        isTemplate: false,
        createdAt: timestampToDate(data.createdAt),
        updatedAt: timestampToDate(data.updatedAt),
        tags: data.tags || [],
      });
    });

    // Sort by updatedAt descending
    return schedules.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  } catch (error) {
    console.error('Error getting user schedules:', error);
    throw new Error('Failed to get schedules');
  }
};

/**
 * Get the default schedule for a user
 */
export const getDefaultSchedule = async (userId: string): Promise<Schedule | null> => {
  try {
    const schedules = await getUserSchedules(userId);
    const defaultSchedule = schedules.find(s => s.isDefault);

    return defaultSchedule || schedules[0] || null;
  } catch (error) {
    console.error('Error getting default schedule:', error);
    return null;
  }
};

/**
 * Delete a schedule
 */
export const deleteSchedule = async (
  scheduleId: string,
  userId: string
): Promise<void> => {
  try {
    const scheduleRef = doc(db, SCHEDULES_COLLECTION, scheduleId);
    const scheduleDoc = await getDoc(scheduleRef);

    if (!scheduleDoc.exists()) {
      throw new Error('Schedule not found');
    }

    if (scheduleDoc.data().userId !== userId) {
      throw new Error('Unauthorized');
    }

    await deleteDoc(scheduleRef);
  } catch (error) {
    console.error('Error deleting schedule:', error);
    throw new Error('Failed to delete schedule');
  }
};

/**
 * Set a schedule as the default
 */
export const setDefaultSchedule = async (
  scheduleId: string,
  userId: string
): Promise<void> => {
  try {
    const batch = writeBatch(db);

    // Get all user schedules
    const schedules = await getUserSchedules(userId);

    // Unset all defaults
    for (const schedule of schedules) {
      if (schedule.isDefault) {
        const ref = doc(db, SCHEDULES_COLLECTION, schedule.id);
        batch.update(ref, {
          isDefault: false,
          updatedAt: serverTimestamp(),
        });
      }
    }

    // Set new default
    const scheduleRef = doc(db, SCHEDULES_COLLECTION, scheduleId);
    batch.update(scheduleRef, {
      isDefault: true,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    console.error('Error setting default schedule:', error);
    throw new Error('Failed to set default schedule');
  }
};

/**
 * Duplicate a schedule
 */
export const duplicateSchedule = async (
  scheduleId: string,
  userId: string,
  newName?: string
): Promise<string> => {
  try {
    const original = await getSchedule(scheduleId, userId);
    if (!original) {
      throw new Error('Schedule not found');
    }

    const newSchedule = {
      name: newName || `${original.name} (Copy)`,
      ...(original.description !== undefined && { description: original.description }),
      timeBlocks: original.timeBlocks,
      isDefault: false,
      isTemplate: false,
      tags: original.tags,
    };

    return await saveSchedule(userId, newSchedule);
  } catch (error) {
    console.error('Error duplicating schedule:', error);
    if (error instanceof Error && error.message.includes('Maximum 10 schedules')) {
      throw error;
    }
    throw new Error('Failed to duplicate schedule');
  }
};

/**
 * Get all templates for a user
 */
export const getUserTemplates = async (userId: string): Promise<ScheduleTemplate[]> => {
  try {
    const templatesQuery = query(
      collection(db, TEMPLATES_COLLECTION),
      where('userId', '==', userId)
    );

    const querySnapshot = await getDocs(templatesQuery);
    const templates: ScheduleTemplate[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      templates.push({
        id: doc.id,
        name: data.name,
        description: data.description,
        timeBlocks: data.timeBlocks,
        category: data.category,
        isPublic: data.isPublic || false,
        userId: data.userId,
        createdAt: timestampToDate(data.createdAt),
      });
    });

    return templates;
  } catch (error) {
    console.error('Error getting templates:', error);
    throw new Error('Failed to get templates');
  }
};
