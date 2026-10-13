# Registration faculty and programme catalogue

The canonical data is `server/src/academic-catalogue.json`, shared by frontend
selection and server validation. It contains the requested initial list of 48
programmes: EMS 8, EDU 8, Humanities 20 and NAS 12. Programme strings are retained
exactly as supplied. Store `department` as the faculty code and `program` as the
selected programme string.

`NAS` is the faculty code for **Natural and Applied Sciences**. New registration
requests reject the retired `NURS` code. Migration `018_nas_faculty_code.sql`
updates that historical code on saved patient profiles without changing their
programmes or clinical doctor/receptionist departments.

## Official catalogue review

Checked SPU's public programme pages on 13 October 2026. The initial application
list is deliberately preserved. The public pages contain additional entries and
different abbreviations; the notes below are an inventory comparison, not an
automatic catalogue update or a statement that every listed qualification is
open for a particular intake.

- **EMS:** The current programme page additionally includes degrees in tourism
  management and public administration; commerce honours in economics and
  accounting; an advanced diploma in e-commerce; a postgraduate diploma in
  management; and a business management master's. These seven additions are not
  in the requested initial list. [SPU Economic and Management Sciences programmes](https://www.spu.ac.za/index.php/spu-economic-and-management-sciences/)
- **EDU:** The faculty programme page covers the three teaching phases and the
  other supplied education qualifications with shorter names. SPU's 2026
  Factfile also lists a postgraduate diploma in language education, which is
  absent from the requested eight. Its separate curriculum-development wording
  should be clarified with the faculty before treating it as another programme.
  [SPU Education programmes](https://www.spu.ac.za/index.php/faculty-of-edu-programmes/),
  [SPU Factfile 2026](https://www.spu.ac.za/index.php/spu-factfile-2026/)
- **NAS / Natural and Applied Sciences:** The current page separately lists a
  geology specialisation within physical sciences alongside the general BSc.
  The initial list retains its broader BSc entry. The page also uses variations
  such as expanded science-degree names and a parenthesised e-Science title;
  these do not replace the supplied strings.
  [SPU Natural and Applied Sciences programmes](https://www.spu.ac.za/index.php/spu-nas-programmes/)

The initial Humanities entries remain unchanged. The faculty and postgraduate
pages can be consulted when an authorised catalogue update is requested:
[SPU Humanities programmes](https://www.spu.ac.za/index.php/faculty-of-hum-programmes/),
[SPU Postgraduate Studies](https://www.spu.ac.za/index.php/postgraduate-studies/).

## Frontend contract

`src/lib/academicCatalogue.ts` exports `FACULTIES`, `getFaculty(code)`,
`getProgrammesForFaculty(code)` and `isValidFacultyProgramme(code, programme)`.
Membership validation is exact; display abbreviations are not alternate values.

`ProgrammeCombobox` accepts `id`, `facultyCode`, `value`, `onChange`, optional
`name` (default `program`), `required`, `disabled` and `describedBy`. Pair it with
a separate label whose `htmlFor` equals its `id`. The parent must clear the
programme when faculty changes. The hidden form field submits only a selected
catalogue member; search text is never used as a programme value.

The combobox supports case-insensitive search, arrow keys, Home/End, Enter,
Escape and Tab. It is disabled until a faculty is selected. Its listbox only
contains programmes belonging to that faculty, and required selections use
native form validation with an actionable message.
