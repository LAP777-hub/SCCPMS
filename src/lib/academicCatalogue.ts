import catalogue from '../../server/src/academic-catalogue.json';

export type FacultyCode = 'EMS' | 'EDU' | 'Humanities' | 'NAS';

export type AcademicFaculty = {
  readonly code: FacultyCode;
  readonly name: string;
  readonly label: string;
  readonly programmes: readonly string[];
};

// NAS identifies Natural and Applied Sciences. Programme names are the supplied
// initial catalogue, unchanged.
export const FACULTIES: readonly AcademicFaculty[] = catalogue.faculties as AcademicFaculty[];

export function getFaculty(code: string): AcademicFaculty | undefined {
  return FACULTIES.find((faculty) => faculty.code === code);
}

export function getProgrammesForFaculty(code: string): readonly string[] {
  return getFaculty(code)?.programmes ?? [];
}

export function isValidFacultyProgramme(code: string, programme: string): boolean {
  return getProgrammesForFaculty(code).includes(programme);
}
