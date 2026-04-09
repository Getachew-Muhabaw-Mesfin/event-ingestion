import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  /**
   * Free-form JSON payload.
   * Set payload.fail = true in tests to trigger the simulated failure path.
   */
  @IsObject()
  @IsNotEmpty()
  payload!: Record<string, unknown>;
}
