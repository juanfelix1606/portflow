import { HttpError } from "../../lib/http-error.ts";
import { isValidIso6346ContainerNumber } from "./iso6346.ts";
import type {
  ContainerActor,
  ContainerCompletionResult,
  ContainerImportRow,
  ContainerListFilters,
  ContainerRepository,
  MovementListOptions,
  RegisterContainerInput
} from "./container.types.ts";

export class ContainerService {
  constructor(private readonly repository: ContainerRepository) {}

  register(input: RegisterContainerInput, actor: ContainerActor) {
    if (!isValidIso6346ContainerNumber(input.containerNumber)) {
      throw new HttpError(
        400,
        "INVALID_CONTAINER_NUMBER",
        "Container number must follow ISO 6346 and have a valid check digit."
      );
    }

    return this.repository.register(input, actor);
  }

  importMany(rows: ContainerImportRow[], actor: ContainerActor) {
    for (const row of rows) {
      if (!isValidIso6346ContainerNumber(row.input.containerNumber)) {
        throw new HttpError(
          400,
          "INVALID_CONTAINER_NUMBER",
          `Container number on row ${row.rowNumber} must follow ISO 6346 and have a valid check digit.`
        );
      }
    }

    return this.repository.importMany(rows, actor);
  }

  async findImportConflicts(rows: ContainerImportRow[]) {
    const existingNumbers = new Set(
      await this.repository.findExistingContainerNumbers(
        rows.map((row) => row.input.containerNumber)
      )
    );

    return rows
      .filter((row) => existingNumbers.has(row.input.containerNumber))
      .map((row) => ({
        row: row.rowNumber,
        column: "containerNumber",
        message: "This container number is already registered."
      }));
  }

  list(filters: ContainerListFilters) {
    return this.repository.list(filters);
  }

  complete(id: string, actor: ContainerActor): Promise<ContainerCompletionResult> {
    return this.repository.complete(id, actor);
  }

  async findById(id: string) {
    const container = await this.repository.findById(id);

    if (!container) {
      throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
    }

    return container;
  }

  async listMovements(id: string, options: MovementListOptions) {
    const container = await this.repository.findById(id);

    if (!container) {
      throw new HttpError(404, "CONTAINER_NOT_FOUND", "The requested container was not found.");
    }

    return this.repository.listMovements(id, options);
  }
}
