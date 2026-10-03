/**
 * Le contrat de l'API Kettle — ENGENDRÉ, NE PAS MODIFIER À LA MAIN.
 *
 * Produit par `npm run contract:build` dans kettleapp-api, depuis les
 * schémas Zod de `src/contract/`. Ces schémas sont ce que l'API applique à
 * ses réponses : un champ qui n'y figure pas ne sort pas.
 *
 * Pour le changer : modifier le schéma côté API, relancer la génération,
 * reporter le fichier ici. Le modifier ici ne changerait rien à ce que l'API
 * envoie — cela ferait seulement mentir les types.
 *
 * Empreinte : 90b4468b820e
 */

export type CustomMetricPayload = { value: number; unit: string };

export type HealthConsentPayload = {
  granted: boolean;
  decidedAt: string;
  version: string;
};

export type UserPayload = {
  id: string;
  email: string;
  isAdmin: boolean;
  isCoach: boolean;
  isClient: boolean;
  healthConsent: {
    granted: boolean;
    decidedAt: string;
    version: string;
  } | null;
  needsHealthConsent: boolean;
  firstName?: string | undefined;
  lastName?: string | undefined;
  picture?: string | undefined;
};

export type AuthPayload = {
  status: 'success';
  user: {
    id: string;
    email: string;
    isAdmin: boolean;
    isCoach: boolean;
    isClient: boolean;
    healthConsent: {
      granted: boolean;
      decidedAt: string;
      version: string;
    } | null;
    needsHealthConsent: boolean;
    firstName?: string | undefined;
    lastName?: string | undefined;
    picture?: string | undefined;
  };
};

export type InviteCheckPayload = {
  valid: true;
  coach: {
    id: string;
    firstName?: string | undefined;
    lastName?: string | undefined;
    picture?: string | undefined;
  };
};

export type MessagePayload = { message: string };

export type SuccessPayload = { status: 'success' };

export type ExercisePayload = {
  _id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  description?: string | undefined;
  videoUrl?: string | undefined;
  usageCount?: number | undefined;
};

export type BlockExercisePayload = {
  exercise: {
    _id: string;
    name: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
    description?: string | undefined;
    videoUrl?: string | undefined;
    usageCount?: number | undefined;
  };
  order: number;
  sets?: number | undefined;
  restBetweenSets?: number | undefined;
  reps?: number | undefined;
  duration?: number | undefined;
  customMetric?: { value: number; unit: string } | undefined;
  note?: string | undefined;
};

export type SessionBlockPayload = {
  _id: string;
  type: string;
  order: number;
  exercises: {
    exercise: {
      _id: string;
      name: string;
      createdBy: string;
      createdAt: string;
      updatedAt: string;
      description?: string | undefined;
      videoUrl?: string | undefined;
      usageCount?: number | undefined;
    };
    order: number;
    sets?: number | undefined;
    restBetweenSets?: number | undefined;
    reps?: number | undefined;
    duration?: number | undefined;
    customMetric?: { value: number; unit: string } | undefined;
    note?: string | undefined;
  }[];
  label?: string | undefined;
  notes?: string | undefined;
  durationMinutes?: number | undefined;
  intervalMinutes?: number | undefined;
  rounds?: number | undefined;
  restBetweenRounds?: number | undefined;
  workDuration?: number | undefined;
  restDuration?: number | undefined;
  repsScheme?: number[] | undefined;
};

export type SessionPayload = {
  _id: string;
  order: number;
  blocks: {
    _id: string;
    type: string;
    order: number;
    exercises: {
      exercise: {
        _id: string;
        name: string;
        createdBy: string;
        createdAt: string;
        updatedAt: string;
        description?: string | undefined;
        videoUrl?: string | undefined;
        usageCount?: number | undefined;
      };
      order: number;
      sets?: number | undefined;
      restBetweenSets?: number | undefined;
      reps?: number | undefined;
      duration?: number | undefined;
      customMetric?: { value: number; unit: string } | undefined;
      note?: string | undefined;
    }[];
    label?: string | undefined;
    notes?: string | undefined;
    durationMinutes?: number | undefined;
    intervalMinutes?: number | undefined;
    rounds?: number | undefined;
    restBetweenRounds?: number | undefined;
    workDuration?: number | undefined;
    restDuration?: number | undefined;
    repsScheme?: number[] | undefined;
  }[];
  createdAt: string;
  updatedAt: string;
  name?: string | undefined;
  notes?: string | undefined;
  suggestedDays?: number[] | undefined;
};

export type ProgramPayload = {
  _id: string;
  createdAt: string;
  updatedAt: string;
  sessions: {
    _id: string;
    order: number;
    blocks: {
      _id: string;
      type: string;
      order: number;
      exercises: {
        exercise: {
          _id: string;
          name: string;
          createdBy: string;
          createdAt: string;
          updatedAt: string;
          description?: string | undefined;
          videoUrl?: string | undefined;
          usageCount?: number | undefined;
        };
        order: number;
        sets?: number | undefined;
        restBetweenSets?: number | undefined;
        reps?: number | undefined;
        duration?: number | undefined;
        customMetric?: { value: number; unit: string } | undefined;
        note?: string | undefined;
      }[];
      label?: string | undefined;
      notes?: string | undefined;
      durationMinutes?: number | undefined;
      intervalMinutes?: number | undefined;
      rounds?: number | undefined;
      restBetweenRounds?: number | undefined;
      workDuration?: number | undefined;
      restDuration?: number | undefined;
      repsScheme?: number[] | undefined;
    }[];
    createdAt: string;
    updatedAt: string;
    name?: string | undefined;
    notes?: string | undefined;
    suggestedDays?: number[] | undefined;
  }[];
};

export type ClientProgramPayload = {
  program: {
    _id: string;
    createdAt: string;
    updatedAt: string;
    sessions: {
      _id: string;
      order: number;
      blocks: {
        _id: string;
        type: string;
        order: number;
        exercises: {
          exercise: {
            _id: string;
            name: string;
            createdBy: string;
            createdAt: string;
            updatedAt: string;
            description?: string | undefined;
            videoUrl?: string | undefined;
            usageCount?: number | undefined;
          };
          order: number;
          sets?: number | undefined;
          restBetweenSets?: number | undefined;
          reps?: number | undefined;
          duration?: number | undefined;
          customMetric?: { value: number; unit: string } | undefined;
          note?: string | undefined;
        }[];
        label?: string | undefined;
        notes?: string | undefined;
        durationMinutes?: number | undefined;
        intervalMinutes?: number | undefined;
        rounds?: number | undefined;
        restBetweenRounds?: number | undefined;
        workDuration?: number | undefined;
        restDuration?: number | undefined;
        repsScheme?: number[] | undefined;
      }[];
      createdAt: string;
      updatedAt: string;
      name?: string | undefined;
      notes?: string | undefined;
      suggestedDays?: number[] | undefined;
    }[];
  };
};

export type PerformedSetPayload = {
  weight?: number | undefined;
  reps?: number | undefined;
  duration?: number | undefined;
};

export type PerformedPayload = {
  sets: {
    weight?: number | undefined;
    reps?: number | undefined;
    duration?: number | undefined;
  }[];
};

export type BlockExerciseSnapshotPayload = {
  exercise: Record<string, unknown>;
  order: number;
  sets?: number | undefined;
  restBetweenSets?: number | undefined;
  reps?: number | undefined;
  duration?: number | undefined;
  customMetric?: { value: number; unit: string } | undefined;
  note?: string | undefined;
  performed?:
    | {
        sets: {
          weight?: number | undefined;
          reps?: number | undefined;
          duration?: number | undefined;
        }[];
      }
    | undefined;
};

export type BlockSnapshotPayload = {
  type: string;
  order: number;
  exercises: {
    exercise: Record<string, unknown>;
    order: number;
    sets?: number | undefined;
    restBetweenSets?: number | undefined;
    reps?: number | undefined;
    duration?: number | undefined;
    customMetric?: { value: number; unit: string } | undefined;
    note?: string | undefined;
    performed?:
      | {
          sets: {
            weight?: number | undefined;
            reps?: number | undefined;
            duration?: number | undefined;
          }[];
        }
      | undefined;
  }[];
  label?: string | undefined;
  notes?: string | undefined;
  durationMinutes?: number | undefined;
  intervalMinutes?: number | undefined;
  rounds?: number | undefined;
  performedRounds?: number | undefined;
  restBetweenRounds?: number | undefined;
  workDuration?: number | undefined;
  restDuration?: number | undefined;
  repsScheme?: number[] | undefined;
};

export type FeedbackPayload = {
  effort: number;
  tags?:
    | (
        | 'poor_sleep'
        | 'pain'
        | 'stress'
        | 'fatigue'
        | 'illness'
        | 'great_shape'
      )[]
    | undefined;
  note?: string | undefined;
};

export type LegacyMetricsPayload = {
  stress: number;
  mood: number;
  energy: number;
  sleep: number;
  soreness: number;
};

export type CompletedSessionPayload = {
  _id: string;
  originalSessionId: string;
  sessionOrder: number;
  blocks: {
    type: string;
    order: number;
    exercises: {
      exercise: Record<string, unknown>;
      order: number;
      sets?: number | undefined;
      restBetweenSets?: number | undefined;
      reps?: number | undefined;
      duration?: number | undefined;
      customMetric?: { value: number; unit: string } | undefined;
      note?: string | undefined;
      performed?:
        | {
            sets: {
              weight?: number | undefined;
              reps?: number | undefined;
              duration?: number | undefined;
            }[];
          }
        | undefined;
    }[];
    label?: string | undefined;
    notes?: string | undefined;
    durationMinutes?: number | undefined;
    intervalMinutes?: number | undefined;
    rounds?: number | undefined;
    performedRounds?: number | undefined;
    restBetweenRounds?: number | undefined;
    workDuration?: number | undefined;
    restDuration?: number | undefined;
    repsScheme?: number[] | undefined;
  }[];
  viewedByCoach: boolean;
  completedAt: string;
  sessionName?: string | undefined;
  coachNotes?: string | undefined;
  feedback?:
    | {
        effort: number;
        tags?:
          | (
              | 'poor_sleep'
              | 'pain'
              | 'stress'
              | 'fatigue'
              | 'illness'
              | 'great_shape'
            )[]
          | undefined;
        note?: string | undefined;
      }
    | undefined;
  metrics?:
    | {
        stress: number;
        mood: number;
        energy: number;
        sleep: number;
        soreness: number;
      }
    | undefined;
  clientNotes?: string | undefined;
  editedAt?: string | undefined;
};

export type CompletedWrapperPayload = {
  completed: {
    _id: string;
    originalSessionId: string;
    sessionOrder: number;
    blocks: {
      type: string;
      order: number;
      exercises: {
        exercise: Record<string, unknown>;
        order: number;
        sets?: number | undefined;
        restBetweenSets?: number | undefined;
        reps?: number | undefined;
        duration?: number | undefined;
        customMetric?: { value: number; unit: string } | undefined;
        note?: string | undefined;
        performed?:
          | {
              sets: {
                weight?: number | undefined;
                reps?: number | undefined;
                duration?: number | undefined;
              }[];
            }
          | undefined;
      }[];
      label?: string | undefined;
      notes?: string | undefined;
      durationMinutes?: number | undefined;
      intervalMinutes?: number | undefined;
      rounds?: number | undefined;
      performedRounds?: number | undefined;
      restBetweenRounds?: number | undefined;
      workDuration?: number | undefined;
      restDuration?: number | undefined;
      repsScheme?: number[] | undefined;
    }[];
    viewedByCoach: boolean;
    completedAt: string;
    sessionName?: string | undefined;
    coachNotes?: string | undefined;
    feedback?:
      | {
          effort: number;
          tags?:
            | (
                | 'poor_sleep'
                | 'pain'
                | 'stress'
                | 'fatigue'
                | 'illness'
                | 'great_shape'
              )[]
            | undefined;
          note?: string | undefined;
        }
      | undefined;
    metrics?:
      | {
          stress: number;
          mood: number;
          energy: number;
          sleep: number;
          soreness: number;
        }
      | undefined;
    clientNotes?: string | undefined;
    editedAt?: string | undefined;
  };
};

export type ClientHistoryPayload = {
  history: {
    _id: string;
    originalSessionId: string;
    sessionOrder: number;
    blocks: {
      type: string;
      order: number;
      exercises: {
        exercise: Record<string, unknown>;
        order: number;
        sets?: number | undefined;
        restBetweenSets?: number | undefined;
        reps?: number | undefined;
        duration?: number | undefined;
        customMetric?: { value: number; unit: string } | undefined;
        note?: string | undefined;
        performed?:
          | {
              sets: {
                weight?: number | undefined;
                reps?: number | undefined;
                duration?: number | undefined;
              }[];
            }
          | undefined;
      }[];
      label?: string | undefined;
      notes?: string | undefined;
      durationMinutes?: number | undefined;
      intervalMinutes?: number | undefined;
      rounds?: number | undefined;
      performedRounds?: number | undefined;
      restBetweenRounds?: number | undefined;
      workDuration?: number | undefined;
      restDuration?: number | undefined;
      repsScheme?: number[] | undefined;
    }[];
    viewedByCoach: boolean;
    completedAt: string;
    sessionName?: string | undefined;
    coachNotes?: string | undefined;
    feedback?:
      | {
          effort: number;
          tags?:
            | (
                | 'poor_sleep'
                | 'pain'
                | 'stress'
                | 'fatigue'
                | 'illness'
                | 'great_shape'
              )[]
            | undefined;
          note?: string | undefined;
        }
      | undefined;
    metrics?:
      | {
          stress: number;
          mood: number;
          energy: number;
          sleep: number;
          soreness: number;
        }
      | undefined;
    clientNotes?: string | undefined;
    editedAt?: string | undefined;
  }[];
};

export type ClientRowPayload = {
  _id: string;
  unseenCount: number;
  linkedAt: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  picture?: string | undefined;
  lastCompletedAt?: string | undefined;
  lastEffort?: number | undefined;
};

export type ClientDetailsPayload = {
  _id: string;
  email: string;
  program: {
    _id: string;
    createdAt: string;
    updatedAt: string;
    sessions: {
      _id: string;
      order: number;
      blocks: {
        _id: string;
        type: string;
        order: number;
        exercises: {
          exercise: {
            _id: string;
            name: string;
            createdBy: string;
            createdAt: string;
            updatedAt: string;
            description?: string | undefined;
            videoUrl?: string | undefined;
            usageCount?: number | undefined;
          };
          order: number;
          sets?: number | undefined;
          restBetweenSets?: number | undefined;
          reps?: number | undefined;
          duration?: number | undefined;
          customMetric?: { value: number; unit: string } | undefined;
          note?: string | undefined;
        }[];
        label?: string | undefined;
        notes?: string | undefined;
        durationMinutes?: number | undefined;
        intervalMinutes?: number | undefined;
        rounds?: number | undefined;
        restBetweenRounds?: number | undefined;
        workDuration?: number | undefined;
        restDuration?: number | undefined;
        repsScheme?: number[] | undefined;
      }[];
      createdAt: string;
      updatedAt: string;
      name?: string | undefined;
      notes?: string | undefined;
      suggestedDays?: number[] | undefined;
    }[];
  };
  unseenCount: number;
  firstName?: string | undefined;
  lastName?: string | undefined;
  picture?: string | undefined;
};

export type ActiveInvitationPayload = {
  token: string;
  expiresAt: string;
} | null;

export type GeneratedInvitationPayload = {
  status: 'success';
  message: string;
  token: string;
  expiresAt: string;
};

export type LinkedCoachPayload = {
  firstName: string;
  lastName: string;
  linkedAt: string;
  picture?: string | undefined;
};

export type AccountSummaryPayload = {
  asClient: {
    coaches: {
      firstName: string;
      lastName: string;
      linkedAt: string;
      picture?: string | undefined;
    }[];
    completedCount: number;
    healthDataCount: number;
    healthConsent: {
      granted: boolean;
      decidedAt: string;
      version: string;
    } | null;
    since: string;
  } | null;
  asCoach: { clientCount: number; since: string } | null;
};

export type AdminStatsPayload = {
  coachCount: number;
  clientCount: number;
  sessionCount: number;
  sessionTodayCount: number;
  exerciseCount: number;
};

export type AdminCoachPayload = {
  _id: string;
  email: string;
  clientCount: number;
  exerciseCount: number;
  createdAt: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  picture?: string | undefined;
};

export type CreatedCoachPayload = {
  status: 'success';
  message: string;
  coach: {
    _id: string;
    email: string;
    firstName?: string | undefined;
    lastName?: string | undefined;
  };
};
