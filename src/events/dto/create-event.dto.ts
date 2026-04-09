import { IsString, IsNotEmpty, IsObject } from 'class-validator';

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsObject()
  @IsNotEmpty()
  payload!: Record<string, unknown>;
}
